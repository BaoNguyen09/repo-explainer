from fastapi import FastAPI, HTTPException, status
import httpx

from claude_service import ClaudeService
from github_tools import GitHubTools
import utils
from schema import ModelResponse, RepoInfo

app = FastAPI()

@app.get("/")
def root():
    return "Welcome to Repo Explainer!"

@app.get("/{owner}/{repo}")
async def explain_repo(owner: str, repo: str):
    try:
        async with httpx.AsyncClient() as client:
            # Validate repo exists (follows redirects automatically)
            res = await client.get(f"https://github.com/{owner}/{repo}")
            res.raise_for_status()  # raises HTTPStatusError for 4xx/5xx
            
            # Fetch repo context
            repo_info = RepoInfo(owner=owner, repo_name=repo)
            repo_content, success = await GitHubTools.get_repo_context(repo_info, http_client=client)
            if not success:
                 raise HTTPException(status_code=500, detail="Failed to fetch repository context")

            # Generate explanation with Claude
            explanation, success = await ClaudeService.explain_repo(repo_info, repo_content)
            if not success:
                raise HTTPException(status_code=500, detail="Failed to generate explanation")

            return ModelResponse(
                explanation=explanation,
                repo=f"{owner}/{repo}",
                cache=False,
                timestamp=utils.date_now()
            )
    except httpx.HTTPStatusError as e:
        # Handle errors from GitHub repo check
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Error accessing given repo: {e.response.text}"
        )
    except Exception as e:
        # Log and catch generic error for unexpected issues
        utils.logger.error(f"Error in explain_repo(): {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="An error occurred internally on the server"
        )