from typing import Optional

import anthropic
from backend import env, utils
from backend.schema import RepoInfo
from backend.prompts import SYSTEM_PROMPT, build_user_prompt

__all__ = ["ClaudeService"]

class ClaudeService:
    """Handles all Claude API interactions"""
    
    MODEL = "claude-haiku-4-5-20251001"
    
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

    