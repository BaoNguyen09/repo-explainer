"""Tests for detached explain jobs: replay, reconnect, and connection-independent runs."""

import asyncio

import pytest

from backend import job_registry, main
from backend.schema import ModelResponse
from backend import utils


@pytest.fixture(autouse=True)
def clean_registry():
    job_registry.reset_for_tests()
    yield
    job_registry.reset_for_tests()


def test_job_key_separates_repo_ref_and_instructions():
    base = job_registry.job_key("octocat", "Hello-World", None, None)
    assert base == job_registry.job_key("octocat", "Hello-World", None, "   ")
    assert base != job_registry.job_key("octocat", "Hello-World", "dev", None)
    assert base != job_registry.job_key("octocat", "Hello-World", None, "focus on tests")


def test_subscribe_replays_events_emitted_before_attaching():
    """A client that connects late must still see the stages it missed."""
    job = job_registry.ExplainJob("k", "octocat", "Hello-World")
    job.put_nowait("fetching_tree")
    job.put_nowait("exploring_files")

    queue = job.subscribe()

    assert queue.get_nowait() == "fetching_tree"
    assert queue.get_nowait() == "exploring_files"


def test_seed_records_without_delivering_to_current_subscribers():
    job = job_registry.ExplainJob("k", "octocat", "Hello-World")
    queue = job.subscribe()
    job.seed("validating")

    assert queue.empty()
    assert job.subscribe().get_nowait() == "validating"


def test_terminal_event_marks_job_done():
    job = job_registry.ExplainJob("k", "octocat", "Hello-World")
    assert not job.done
    job.put_nowait({"done": True, "result": "x"})
    assert job.done
    assert job.seconds_since_finished is not None


def test_error_event_also_marks_job_done():
    job = job_registry.ExplainJob("k", "octocat", "Hello-World")
    job.put_nowait({"error": "boom"})
    assert job.done


def test_unsubscribe_stops_delivery_but_job_keeps_recording():
    """The whole point: a client leaving must not stop the work."""
    job = job_registry.ExplainJob("k", "octocat", "Hello-World")
    queue = job.subscribe()
    job.unsubscribe(queue)

    job.put_nowait("generating_explanation")

    assert queue.empty()
    assert job.events == ["generating_explanation"]


def test_start_replaces_an_existing_finished_job():
    """An explicit regenerate must not replay the previous run's result."""

    async def scenario():
        async def runner(job):
            job.put_nowait({"done": True, "result": "first"})

        first = job_registry.start("k", "octocat", "Hello-World", runner)
        await asyncio.sleep(0)
        assert first.done

        second = job_registry.start("k", "octocat", "Hello-World", runner)
        assert second is not first
        assert job_registry.find("k") is second

    asyncio.run(scenario())


def test_expired_finished_job_is_purged(monkeypatch):
    # Negative rather than 0: time.monotonic() on Windows can report a 0.0 delta
    # across a short sleep, which would make a `> 0` comparison flaky.
    monkeypatch.setattr(job_registry.env, "EXPLAIN_JOB_RESULT_TTL_SECONDS", -1)

    async def scenario():
        async def runner(job):
            job.put_nowait({"done": True, "result": "x"})

        job_registry.start("k", "octocat", "Hello-World", runner)
        await asyncio.sleep(0.01)
        assert job_registry.find("k") is None

    asyncio.run(scenario())


def test_crashed_task_releases_subscribers():
    """A pipeline that raises must still unblock anyone waiting on the queue."""

    async def scenario():
        async def runner(job):
            raise RuntimeError("pipeline exploded")

        job = job_registry.start("k", "octocat", "Hello-World", runner)
        queue = job.subscribe()
        item = await asyncio.wait_for(queue.get(), timeout=1.0)
        assert item["error"]

    asyncio.run(scenario())


async def _collect(generator) -> list[str]:
    return [chunk async for chunk in generator]


def _fake_request(client_ip: str = "1.2.3.4"):
    from types import SimpleNamespace

    return SimpleNamespace(
        client=SimpleNamespace(host=client_ip),
        headers=main.Headers(raw=[]),
        query_params={},
    )


def _stub_pipeline(monkeypatch, events):
    """Replace the real pipeline with one that emits `events` into the job."""

    async def fake_pipeline(owner, repo, ref, instructions, request, queue):
        for event in events:
            queue.put_nowait(event)

    monkeypatch.setattr(main, "_run_stream_pipeline", fake_pipeline)


def _stub_validation(monkeypatch, detail=None):
    async def fake_validate(owner, repo):
        return detail

    monkeypatch.setattr(main, "_validate_repo_exists", fake_validate)


def test_stream_generator_leaves_job_running_after_client_disconnects(monkeypatch):
    """Closing the stream early must not cancel the job; the result still arrives."""
    _stub_validation(monkeypatch)

    async def scenario():
        release = asyncio.Event()

        async def fake_pipeline(owner, repo, ref, instructions, request, queue):
            queue.put_nowait("fetching_tree")
            await release.wait()
            queue.put_nowait(
                {
                    "done": True,
                    "result": ModelResponse(
                        explanation="done",
                        repo=f"{owner}/{repo}",
                        cache=False,
                        timestamp=utils.date_now(),
                        default_branch="main",
                        suggested_questions=[],
                    ),
                }
            )

        monkeypatch.setattr(main, "_run_stream_pipeline", fake_pipeline)

        # First client reads the first stage, then walks away (generator closed).
        generator = main._stream_generator("octocat", "Hello-World", None, None, _fake_request())
        assert "validating" in await generator.__anext__()
        assert "fetching_tree" in await generator.__anext__()
        await generator.aclose()

        key = job_registry.job_key("octocat", "Hello-World", None, None)
        job = job_registry.find(key)
        assert job is not None and not job.done

        # Work continues and completes with nobody attached.
        release.set()
        await asyncio.sleep(0.01)
        assert job.done

        # A reconnect replays the whole run, including the result.
        resumed = main._stream_generator(
            "octocat", "Hello-World", None, None, _fake_request(), resume=True
        )
        chunks = await _collect(resumed)
        assert any("validating" in chunk for chunk in chunks)
        assert any("fetching_tree" in chunk for chunk in chunks)
        assert any("event: result" in chunk for chunk in chunks)

    asyncio.run(scenario())


def test_reconnect_does_not_start_a_second_job(monkeypatch):
    """Two connections for the same repo share one pipeline run."""
    _stub_validation(monkeypatch)
    runs = {"count": 0}

    async def scenario():
        async def fake_pipeline(owner, repo, ref, instructions, request, queue):
            runs["count"] += 1
            queue.put_nowait({"error": "stop here"})

        monkeypatch.setattr(main, "_run_stream_pipeline", fake_pipeline)

        first = main._stream_generator("octocat", "Hello-World", None, None, _fake_request())
        await _collect(first)
        second = main._stream_generator(
            "octocat", "Hello-World", None, None, _fake_request(), resume=True
        )
        chunks = await _collect(second)

        assert runs["count"] == 1
        assert any("event: error" in chunk for chunk in chunks)

    asyncio.run(scenario())


def test_resume_of_unknown_job_starts_a_fresh_run(monkeypatch):
    """After a server restart there is nothing to resume — fall back to running it."""
    _stub_validation(monkeypatch)
    _stub_pipeline(monkeypatch, [{"error": "done"}])

    async def scenario():
        generator = main._stream_generator(
            "octocat", "Hello-World", None, None, _fake_request(), resume=True
        )
        chunks = await _collect(generator)
        assert any("validating" in chunk for chunk in chunks)

    asyncio.run(scenario())


def test_reconnecting_does_not_consume_rate_limit_quota(monkeypatch):
    """Reloading during a long run must be free; only new jobs are charged."""
    _stub_validation(monkeypatch)
    monkeypatch.setattr(main.env, "EXPLAIN_RATE_LIMIT_JOBS", 1)
    main._explain_rate_windows.clear()

    async def scenario():
        async def fake_pipeline(owner, repo, ref, instructions, request, queue):
            queue.put_nowait("fetching_tree")
            await asyncio.sleep(60)  # never finishes during the test

        monkeypatch.setattr(main, "_run_stream_pipeline", fake_pipeline)

        first = main._stream_generator("octocat", "Hello-World", None, None, _fake_request())
        await first.__anext__()
        await first.__anext__()
        await first.aclose()

        # Same client, same repo, five reconnects: none should be rate limited.
        for _ in range(5):
            again = main._stream_generator(
                "octocat", "Hello-World", None, None, _fake_request(), resume=True
            )
            chunk = await again.__anext__()
            assert "Rate limit" not in chunk
            await again.aclose()

    asyncio.run(scenario())


def test_new_job_beyond_limit_is_rate_limited(monkeypatch):
    _stub_validation(monkeypatch)
    _stub_pipeline(monkeypatch, [{"error": "done"}])
    monkeypatch.setattr(main.env, "EXPLAIN_RATE_LIMIT_JOBS", 1)
    main._explain_rate_windows.clear()

    async def scenario():
        await _collect(main._stream_generator("a", "b", None, None, _fake_request()))
        chunks = await _collect(main._stream_generator("c", "d", None, None, _fake_request()))
        assert any("Rate limit exceeded" in chunk for chunk in chunks)

    asyncio.run(scenario())


def test_invalid_repo_never_creates_a_job(monkeypatch):
    _stub_validation(monkeypatch, detail="Repository 'x/y' not found.")

    async def scenario():
        chunks = await _collect(main._stream_generator("x", "y", None, None, _fake_request()))
        assert any("not found" in chunk for chunk in chunks)
        assert job_registry.find(job_registry.job_key("x", "y", None, None)) is None

    asyncio.run(scenario())
