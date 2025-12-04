import anthropic
import env, utils
from schema import RepoInfo

__all__ = ["ClaudeService"]

class ClaudeService:
    """Handles all Claude API interactions"""
    
    MODEL = "claude-haiku-4-5-20251001"
    
    @classmethod
    async def explain_repo(
        cls,
        repo: RepoInfo,
        repo_context: str,
    ) -> tuple[str, bool]:
        """
        Send repo context to Claude and get explanation.
        
        Args:
            repo: info related to the requested repo to fetch
            repo_context: The formatted context from GitHubTools.get_repo_context()
            
        Returns:
            explanation: The generated explanation
            success: Boolean status
        """

        SYSTEM_PROMPT = """You are an staff software engineer. Explain GitHub repositories 
        clearly and concisely for curious developers who want to understand the codebase
        Produce answer in Markdown format."""

        USER_PROMPT_TEMPLATE = """Explain this repository: {repo_name}

        For output format, produce 3 main sections: How all main components connect, What
        is this repo, and other info you think is important to include.

        Repository context:
        {repo_context}"""
        repo_name = f"{repo.owner}/{repo.repo_name}"
        prompt = USER_PROMPT_TEMPLATE.format(repo_name=repo_name, repo_context=repo_context)

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
            utils.logger.error(f"{cls.__name__}.explain_repo(): {e}")
            return str(e), False

    