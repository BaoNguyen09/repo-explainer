"""Tests for GitHubTools repo-context fetching resilience."""

import asyncio
from unittest.mock import MagicMock

from backend import github_tools
from backend.github_tools import GitHubTools
from backend.schema import GitHubApiError, RepoInfo


def test_get_repo_context_survives_partial_fetch_failures(monkeypatch):
    """One failed file fetch (403/timeout) must skip that file, not abort the whole context."""
    github = GitHubTools(MagicMock(), github_token=None)
    repo = RepoInfo(owner="octocat", repo_name="Hello-World")

    async def fake_tree(repo, depth):
        return "Directory structure:\n└── octocat/Hello-World/\n    ├── good.py\n    └── bad.py"

    async def fake_list(repo_arg, path=""):
        return ["README.md"], True

    async def fake_explore(tree, repo_prefix=""):
        return ["good.py", "bad.py"]

    async def fake_fetch(repo_arg, path):
        if path == "bad.py":
            raise GitHubApiError("GitHub API error: 403")
        return f"content of {path}", True

    monkeypatch.setattr(github, "fetch_directory_tree_with_depth", fake_tree)
    monkeypatch.setattr(github, "list_directory_files", fake_list)
    monkeypatch.setattr(github, "get_file_contents", fake_fetch)
    monkeypatch.setattr(github_tools.ai_service, "get_files_to_explore", fake_explore)

    content, success, tree_count, files_read = asyncio.run(github.get_repo_context(repo))

    assert success is True
    assert "content of good.py" in content
    assert "content of README.md" in content
    assert "content of bad.py" not in content
    assert files_read == 3  # attempted: README.md + good.py + bad.py


def test_get_repo_context_all_fetches_fail_still_returns_tree(monkeypatch):
    """Even if every file fetch fails, the tree alone should come back as context."""
    github = GitHubTools(MagicMock(), github_token=None)
    repo = RepoInfo(owner="octocat", repo_name="Hello-World")

    async def fake_tree(repo, depth):
        return "Directory structure:\n└── octocat/Hello-World/\n    └── README.md"

    async def fake_list(repo_arg, path=""):
        return ["README.md"], True

    async def fake_explore(tree, repo_prefix=""):
        return []

    async def fake_fetch(repo_arg, path):
        raise GitHubApiError("GitHub API error: 403")

    monkeypatch.setattr(github, "fetch_directory_tree_with_depth", fake_tree)
    monkeypatch.setattr(github, "list_directory_files", fake_list)
    monkeypatch.setattr(github, "get_file_contents", fake_fetch)
    monkeypatch.setattr(github_tools.ai_service, "get_files_to_explore", fake_explore)

    content, success, tree_count, files_read = asyncio.run(github.get_repo_context(repo))

    assert success is True
    assert "Directory structure:" in content
