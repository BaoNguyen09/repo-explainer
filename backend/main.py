from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import httpx
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from backend.claude_service import ClaudeService
from backend.github_tools import GitHubTools
from backend import utils
from backend.schema import ModelResponse, RepoInfo

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Allow only frontend url
origins = [
    "http://localhost:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return "Welcome to Repo Explainer!"

@app.get(
    "/{owner}/{repo}",
    responses={
        403: {"description": "Repository is private or GitHub rate limit exceeded"},
        404: {"description": "Repository not found"},
        500: {"description": "Internal server error"}
    }
)
@limiter.limit("20/day")  # 20 requests/day per user
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
        status_code = e.response.status_code
        
        error_messages = {
            403: f"Repository '{owner}/{repo}' is private or access is forbidden.",
            404: f"Repository '{owner}/{repo}' not found. Please check the owner and repository name.",
            429: "Too many requests to GitHub. Please try again later.",
        }
        
        detail = error_messages.get(
            status_code, 
            f"Error accessing repository '{owner}/{repo}' (HTTP {status_code})"
        )
        
        raise HTTPException(
            status_code=status_code if status_code < 500 else 500,
            detail=detail
        )
    except Exception as e:
        # Log and catch generic error for unexpected issues
        utils.logger.error(f"Error in explain_repo(): {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="An error occurred internally on the server"
        )