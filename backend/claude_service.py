from typing import List, Optional

import anthropic
from backend import env, utils
from backend.schema import RepoInfo
from backend.prompts import (
    SYSTEM_PROMPT,
    build_user_prompt,
    FILES_TO_EXPLORE_SYSTEM,
    build_files_to_explore_user,
    parse_paths_from_response,
)

__all__ = ["ClaudeService"]


class ClaudeService:
    """Handles all Claude API interactions."""

    MODEL = "claude-haiku-4-5-20251001"

    @classmethod
    async def _call_llm(cls, system: str, user_content: str, max_tokens: int = 4096) -> str:
        """Single LLM call. Returns the assistant text."""
        client = anthropic.AsyncAnthropic(api_key=env.ANTHROPIC_API_KEY)
        message = await client.messages.create(
            model=cls.MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
        return message.content[0].text

    @classmethod
    async def get_files_to_explore(cls, tree_str: str) -> List[str]:
        """
        Ask the LLM which files to read based on the directory tree. Returns a list of paths.
        On failure or empty response, returns [] so caller can fall back to IMPORTANT_FILES only.
        """
        try:
            user_content = build_files_to_explore_user(tree_str)
            utils.logger.info(f"{cls.__name__}.get_files_to_explore(): Fetching AI-suggested files")
            response = await cls._call_llm(FILES_TO_EXPLORE_SYSTEM, user_content)
            paths = parse_paths_from_response(response)
            return paths if paths else []
        except Exception as e:
            utils.logger.warning(f"{cls.__name__}.get_files_to_explore failed: {e}, falling back to empty list")
            return []

    @classmethod
    async def explain_repo(
        cls,
        repo: RepoInfo,
        repo_context: str,
        instructions: Optional[str] = None,
    ) -> tuple[str, bool]:
        """
        Send repo context to Claude and get explanation.
        
        Args:
            repo: info related to the requested repo to fetch
            repo_context: The formatted context from GitHubTools.get_repo_context()
            instructions: Optional user instructions/questions to tailor the explanation
            
        Returns:
            explanation: The generated explanation
            success: Boolean status
        """
        repo_name = f"{repo.owner}/{repo.repo_name}"
        prompt = build_user_prompt(repo_name, repo_context, instructions)

        try:
            utils.logger.info(f"{cls.__name__}.explain_repo(): Set up Claude client")
            client = anthropic.AsyncAnthropic(api_key=env.ANTHROPIC_API_KEY)

            utils.logger.info(f"{cls.__name__}.explain_repo(): Calling Claude api")
            message = await client.messages.create(
                model=cls.MODEL,
                max_tokens=10_000,
                system=SYSTEM_PROMPT,
                messages=[{
                    "role": "user", 
                    "content": prompt,

                }]
            )

            return message.content[0].text, True
            
        except Exception as e:
            utils.logger.exception(f"{cls.__name__}.explain_repo(): {e}")
            return str(e), False

    