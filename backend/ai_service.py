from typing import Callable, List, Optional, Tuple

from backend import env, utils
from backend.ai.providers.base import LLMProvider
from backend.ai.providers.claude import ClaudeProvider
from backend.ai.providers.gemini import GeminiProvider
from backend.prompts import (
    SYSTEM_PROMPT,
    build_user_prompt,
    FILES_TO_EXPLORE_SYSTEM,
    build_files_to_explore_user,
    parse_paths_from_response,
)
from backend.schema import RepoInfo

__all__ = ["get_files_to_explore", "explain_repo"]


_provider: Optional[LLMProvider] = None


def _normalize_llm_path(path: str, repo_prefix: str = "") -> str:
    """
    Normalize obvious LLM path mistakes.

    1. Strip leading `owner/repo/` prefix that models prepend because the
       tree root label shows `└── owner/repo/`.
       e.g. "fastapi/fastapi/README.md" with prefix "fastapi/fastapi"
            → "README.md"
    2. Collapse any remaining duplicated leading segments as a safety net.
       e.g. "fastapi/fastapi/utils.py" → "fastapi/utils.py"
    """
    # Step 1: strip the owner/repo prefix (with trailing slash).
    if repo_prefix:
        prefix_slash = repo_prefix.rstrip("/") + "/"
        while path.startswith(prefix_slash):
            path = path[len(prefix_slash):]

    # Step 2: collapse remaining duplicate leading segments.
    parts = [p for p in path.split("/") if p]
    while len(parts) > 1 and parts[0] == parts[1]:
        del parts[1]
    return "/".join(parts)


def _get_provider() -> LLMProvider:
    """
    Lazily construct and cache the configured provider.

    Provider selection is controlled by env.AI_PROVIDER.
    """
    global _provider
    if _provider is not None:
        return _provider

    provider_name = (env.AI_PROVIDER or "claude").strip().lower()

    if provider_name == "gemini":
        utils.logger.info("ai_service: using Gemini provider")
        _provider = GeminiProvider()
    elif provider_name == "claude":
        utils.logger.info("ai_service: using Claude provider")
        _provider = ClaudeProvider()
    else:
        utils.logger.warning(
            "ai_service: unknown AI_PROVIDER '%s', defaulting to Claude", provider_name
        )
        _provider = ClaudeProvider()

    return _provider


async def get_files_to_explore(tree_str: str, repo_prefix: str = "") -> List[str]:
    """
    Ask the configured LLM which files to read based on the directory tree.

    Args:
        tree_str: The formatted directory tree string shown to the LLM.
        repo_prefix: The "owner/repo" string (e.g. "fastapi/fastapi") so we
                     can strip it from paths the model incorrectly prepends.
    """
    try:
        user_content = build_files_to_explore_user(tree_str)
        utils.logger.info(
            "ai_service.get_files_to_explore(): Fetching AI-suggested files via provider %s",
            env.AI_PROVIDER,
        )
        provider = _get_provider()
        response = await provider.call_llm(FILES_TO_EXPLORE_SYSTEM, user_content)
        raw_paths = parse_paths_from_response(response)

        if not raw_paths:
            return []

        # Post-process: strip owner/repo prefix, collapse duplicates, deduplicate.
        cleaned: List[str] = []
        seen: set[str] = set()
        for p in raw_paths:
            norm = _normalize_llm_path(p, repo_prefix)
            if not norm:
                continue
            if norm in seen:
                continue
            seen.add(norm)
            cleaned.append(norm)

        utils.logger.info(
            "ai_service.get_files_to_explore(): %d raw paths → %d cleaned paths",
            len(raw_paths),
            len(cleaned),
        )
        return cleaned
    except Exception as e:
        utils.logger.warning(
            "ai_service.get_files_to_explore failed: %s, falling back to empty list", e
        )
        return []


async def explain_repo(
    repo: RepoInfo,
    repo_context: str,
    instructions: Optional[str] = None,
    status_callback: Optional[Callable[[str], None]] = None,
) -> Tuple[str, bool]:
    """
    Send repo context to the configured provider and get an explanation.

    This function keeps the original ClaudeService.explain_repo signature so
    callers in main.py and tests can switch over without logic changes.
    """
    repo_name = f"{repo.owner}/{repo.repo_name}"
    prompt = build_user_prompt(repo_name, repo_context, instructions)

    try:
        if status_callback:
            status_callback("generating_explanation")

        provider = _get_provider()
        utils.logger.info(
            "ai_service.explain_repo(): Calling provider %s", env.AI_PROVIDER
        )
        text = await provider.call_llm(SYSTEM_PROMPT, prompt, max_tokens=10_000)
        return text, True
    except Exception as e:
        utils.logger.exception("ai_service.explain_repo(): %s", e)
        return str(e), False

