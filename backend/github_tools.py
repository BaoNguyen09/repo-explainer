import asyncio
import sys
from typing import Optional
import httpx

from schema import GitHubApiError, RepoInfo

IMPORTANT_FILES = [
    'README.md',
    'package.json',      # Node.js/npm
    'requirements.txt',  # Python
    'go.mod',            # Go
    'Cargo.toml',        # Rust
    'pom.xml',           # Java Maven
    'build.gradle',      # Java Gradle
    'setup.py',          # Python setuptools
    'pyproject.toml',    # Python modern
    '.env.example',      # Environment setup
    'Dockerfile',        # Containerization hint
    'docker-compose.yml',
    'Makefile',
    'LICENSE',
    'CONTRIBUTING.md',
    'package-lock.json', # Lock files for context
    'yarn.lock',
    'Pipfile',
]

SKIP_PATTERNS = [
    '__pycache__', 'node_modules', '.git', 'dist', 'build',
    '.next', '.venv', 'venv', '.idea', '.vscode',
    '*.min.js', '*.min.css', '.DS_Store',
]

TREE_DEPTH = 2  # Just top-level structure
MAX_FILE_SIZE = 5000  # chars, not bytes

async def get_file_contents(
    repo: RepoInfo, 
    path: str,
    http_client: httpx.AsyncClient,
    ref: Optional[str] = None,
    github_token: Optional[str] = None,
) -> tuple[Optional[str], bool]:
    """
    Fetch the contents from github file/directory

    Args:
        repo: info related to the requested repo to fetch
        path: relative path to the file/directory
        http_client: An instance of httpx.AsyncClient for making requests
        ref: The name of the commit/branch/tag. Default: the repository’s default branch
        github_token: Optional GitHub API token for authentication

    Returns:
        The content of the file/directory as string
        Boolean as the status of the operation

    Raises:
        GitHubApiError: If there's an issue communicating with the GitHub API
                        or if the response is unexpected.
    """
    headers = {
        "Accept": "application/vnd.github.raw+json", # Use raw media type for direct content
        "X-GitHub-Api-Version": "2022-11-28"
    }
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"
    params = {}
    if ref:
        params["ref"] = ref

    url = f"https://api.github.com/repos/{repo.owner}/{repo.repo_name}/contents/{path}"
    
    try:
        response = await http_client.get(url, headers=headers, params=params, follow_redirects=True) # Allow redirects for raw content

        if response.status_code == 404:
            error_msg = f"File/Directory not found: {path} in {repo.owner}/{repo.repo_name}@{ref or 'default branch'}"
            print(error_msg, file=sys.stderr)
            return None, False
        response.raise_for_status()

        # returned_content_type = response.headers["Content-Type"]
        # if returned_content_type == "application/json; charset=utf-8": # this is a dir, so format it and return
        #     data = response.json()
        #     return format_github_tree_structure(data, f"{repo.owner}/{repo.repo_name}", None), True
        # else it's a raw text of file content
        return response.text, True

    except httpx.HTTPStatusError as e:
        print(f"GitHub API error fetching file/directory {path}@{ref or 'default'}: {e.response.status_code} - {e.response.text}", file=sys.stderr)
        raise GitHubApiError(f"GitHub API error: {e.response.status_code}", status_code=e.response.status_code, details=e.response.text) from e
    except Exception as e:
        print(f"Error fetching or decoding file/directory {path}@{ref or 'default'}: {e}", file=sys.stderr)
        raise GitHubApiError(f"Failed to process contents: {str(e)}") from e