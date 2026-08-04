"""
In-memory registry of detached explain jobs.

An explain job is expensive (GitHub fetches + several LLM calls) but the SSE
connection carrying its progress is fragile: a page reload, a tab switch on
mobile, or a flaky network drops it. Before this registry the pipeline task was
owned by the streaming response, so a dropped connection cancelled the work.

Here the task is owned by the registry instead. Every event the pipeline emits
is appended to a replay log and fanned out to whichever connections happen to be
subscribed at the time. A client that reconnects replays the log and then follows
live, so a reload costs nothing, and a client that walks away entirely still
leaves the job running to completion for the next visit.

Single-process only: this is a module-level dict, so it assumes the one worker
that the app currently runs with. With multiple workers a reconnect can land on
a worker that doesn't know the job, which degrades to today's behaviour (a fresh
run) rather than breaking.
"""

import asyncio
import time
from typing import Any, Optional

from backend import env, utils

# Sentinel appended to the replay log so that subscribers waiting on a job that
# finished while they were mid-attach terminate instead of blocking.
_TERMINAL_KEYS = ("error", "done")


def job_key(owner: str, repo: str, ref: Optional[str], instructions: Optional[str]) -> str:
    """Identity of a job: same repo + ref + instructions is the same unit of work."""
    return f"{owner}/{repo}|{ref or ''}|{(instructions or '').strip()}"


class ExplainJob:
    """One detached explain run, with a replay log and live subscribers.

    Deliberately exposes ``put_nowait`` so it is drop-in compatible with the
    ``asyncio.Queue`` the pipeline was already written against — the pipeline
    does not need to know whether it is streaming to one connection or none.
    """

    def __init__(self, key: str, owner: str, repo: str) -> None:
        self.key = key
        self.owner = owner
        self.repo = repo
        self.events: list[Any] = []
        self.subscribers: set[asyncio.Queue] = set()
        self.done = False
        self.created_at = time.monotonic()
        self.finished_at: Optional[float] = None
        self.task: Optional[asyncio.Task] = None

    def put_nowait(self, item: Any) -> None:
        """Record an event and fan it out to every live subscriber."""
        self.events.append(item)
        if isinstance(item, dict) and any(item.get(key) for key in _TERMINAL_KEYS):
            self.done = True
            self.finished_at = time.monotonic()
        for queue in list(self.subscribers):
            queue.put_nowait(item)

    def seed(self, item: Any) -> None:
        """Record an event in the replay log without delivering it to current
        subscribers — for events the opening connection has already received."""
        self.events.append(item)

    def subscribe(self) -> asyncio.Queue:
        """Return a queue pre-seeded with the replay log, then fed live events."""
        queue: asyncio.Queue = asyncio.Queue()
        for item in self.events:
            queue.put_nowait(item)
        self.subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self.subscribers.discard(queue)

    @property
    def age_seconds(self) -> float:
        return time.monotonic() - self.created_at

    @property
    def seconds_since_finished(self) -> Optional[float]:
        if self.finished_at is None:
            return None
        return time.monotonic() - self.finished_at


_jobs: dict[str, ExplainJob] = {}


def _is_expired(job: ExplainJob) -> bool:
    """Whether a job should be dropped from the registry.

    Finished jobs are kept briefly so a client that reloads just as the result
    lands still gets it; running jobs are kept until they exceed the pipeline's
    own ceiling, past which they are assumed wedged.
    """
    if job.done:
        since = job.seconds_since_finished
        return since is not None and since > env.EXPLAIN_JOB_RESULT_TTL_SECONDS
    return job.age_seconds > env.EXPLAIN_JOB_MAX_RUNTIME_SECONDS


def purge_expired() -> None:
    """Drop expired jobs. Called opportunistically whenever a job is looked up."""
    for key in [key for key, job in _jobs.items() if _is_expired(job)]:
        job = _jobs.pop(key, None)
        if job and job.task and not job.task.done():
            job.task.cancel()


def find(key: str) -> Optional[ExplainJob]:
    """Return a live job for `key`, purging expired entries first."""
    purge_expired()
    return _jobs.get(key)


def start(key: str, owner: str, repo: str, runner: Any) -> ExplainJob:
    """Register a job and launch `runner(job)` as a task detached from any request.

    Any existing entry for `key` is replaced (and cancelled), so an explicit
    regenerate always gets a fresh run rather than replaying a stale result.
    """
    purge_expired()
    previous = _jobs.pop(key, None)
    if previous and previous.task and not previous.task.done():
        previous.task.cancel()

    job = ExplainJob(key=key, owner=owner, repo=repo)
    job.task = asyncio.create_task(runner(job))
    job.task.add_done_callback(lambda task: _on_task_done(job, task))
    _jobs[key] = job
    return job


def _on_task_done(job: ExplainJob, task: asyncio.Task) -> None:
    """Make sure subscribers are released even if the pipeline died unexpectedly."""
    if job.done:
        return
    if task.cancelled():
        job.put_nowait({"error": "Explanation was cancelled."})
        return
    exception = task.exception()
    if exception is not None:
        utils.logger.exception("Explain job %s crashed: %s", job.key, exception)
        job.put_nowait({"error": "An error occurred internally on the server"})
    else:
        # Pipeline returned without emitting a terminal event; don't hang readers.
        job.put_nowait({"error": "Explanation ended unexpectedly."})


def reset_for_tests() -> None:
    """Clear the registry between tests."""
    for job in _jobs.values():
        if job.task and not job.task.done():
            job.task.cancel()
    _jobs.clear()
