from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
import httpx
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from backend import ClaudeService, GitHubTools
from backend import utils, env
from backend.database import RepoExplanation, SessionLocal
from backend.schema import ModelResponse, RepoInfo

scheduler = AsyncIOScheduler()


def _user_facing_error(msg: str) -> str:
    """Map known API/backend errors to user-friendly messages; pass through the rest."""
    if not msg:
        return "Something went wrong. Please try again."
    msg_lower = msg.lower()
    if "prompt is too long" in msg_lower or ("too long" in msg_lower and "token" in msg_lower):
        return "This repository has too much content to analyze (over the model's limit). Try a smaller repo or a specific branch."
    if "connection" in msg_lower and "failed" in msg_lower:
        return "Could not reach the AI service. Check your connection or try again in a moment."
    if "rate limit" in msg_lower or "429" in msg:
        return "Rate limit exceeded. Please try again later."
    return msg


def cleanup_expired_cache() -> None:
    """Delete expired cache entries."""
    db = SessionLocal()
    try:
        deleted = db.query(RepoExplanation).filter(
            RepoExplanation.expires_at < datetime.now(timezone.utc)
        ).delete()
        db.commit()
        utils.logger.info("Cleaned up %s expired cache entries", deleted)
    except Exception as e:
        db.rollback()
        utils.logger.exception("Error cleaning cache: %s", e)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(
        cleanup_expired_cache,
        "interval",
        hours=6,
        id="cleanup_cache",
    )
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


limiter = Limiter(key_func=get_remote_address)
app = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Allow frontend URLs from environment variable
# CORS_ORIGINS can be a comma-separated list: "http://localhost:5173,https://yourdomain.com"
origins = [origin.strip() for origin in env.CORS_ORIGINS.split(",") if origin.strip()]

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
async def explain_repo(
    request: Request, 
    owner: str, 
    repo: str,
    ref: Optional[str] = None
):
    try:
        async with httpx.AsyncClient() as client:
            # Validate repo exists (follows redirects automatically)
            res = await client.get(f"https://github.com/{owner}/{repo}")
            res.raise_for_status()  # raises HTTPStatusError for 4xx/5xx
            
            # Fetch repo context
            repo_info = RepoInfo(owner=owner, repo_name=repo)
            github_token = request.headers.get("X-GitHub-Token") or env.GITHUB_TOKEN
            if github_token == "":
                github_token = None
            
            # Create GitHubTools instance with request-scoped config
            github = GitHubTools(client, github_token=github_token, ref=ref)
            repo_content, success = await github.get_repo_context(repo_info)
            if not success:
                raise HTTPException(status_code=500, detail="Failed to fetch repository context")

            # Generate explanation with Claude
            explanation, success = await ClaudeService.explain_repo(repo_info, repo_content)
            if not success:
                raise HTTPException(
                    status_code=500,
                    detail=_user_facing_error(explanation or "Failed to generate explanation"),
                )

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
        utils.logger.exception(f"Error in explain_repo(): {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="An error occurred internally on the server"
        )