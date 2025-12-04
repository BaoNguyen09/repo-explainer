from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel

class RepoInfo(BaseModel):
    owner: str
    repo_name: str

class GitHubApiError(Exception):
    """Custom exception for GitHub API errors."""
    def __init__(self, message: str, status_code: Optional[int] = None, details: Optional[Any] = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details

class ModelResponse(BaseModel):
    explanation: str
    repo: str
    timestamp: datetime
    cache: bool