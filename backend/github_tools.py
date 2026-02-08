import asyncio
from typing import Any, Callable, Dict, List, Optional
import httpx

from backend.claude_service import ClaudeService
from backend.schema import GitHubApiError, RepoInfo
from backend import utils

__all__ = ["GitHubTools"]

class GitHubTools:

    IMPORTANT_FILES = [  # in order of priority
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
        'Pipfile',
    ]

    # SKIP_PATTERNS = [ No need right now since i'm only using allowed list
    #     '__pycache__', 'node_modules', '.git', 'dist', 'build',
    #     '.next', '.venv', 'venv', '.idea', '.vscode',
    #     '*.min.js', '*.min.css', '.DS_Store', '.lock'
    # ]

    TREE_DEPTH = 3  # Just top-level structures
    MAX_TOTAL_CHARS = 100_000  # ~25k tokens or 100kb
    MAX_FILE_CHARS = 30_000   # Cap per-file so one huge file (e.g. lockfile) doesn't dominate
    MAX_FILES_TO_FETCH = 25   # Cap merged list (IMPORTANT_FILES + LLM-suggested) for rate limits

    def __init__(
        self, 
        http_client: httpx.AsyncClient, 
        github_token: Optional[str] = None, 
        ref: Optional[str] = None
    ) -> None:
        """
        Initialize GitHubTools with request-scoped configuration.
        
        Args:
            http_client: An instance of httpx.AsyncClient for making requests
            github_token: Optional GitHub API token for authentication
            ref: The name of the commit/branch/tag. Default: the repository's default branch
        """
        self.client = http_client
        self.token = github_token
        self.ref = ref

    def _get_headers(self, accept: str = "application/vnd.github.v3+json") -> dict:
        """Build headers dict with optional auth token."""
        headers = {
            "Accept": accept,
            "X-GitHub-Api-Version": "2022-11-28"
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    async def get_file_contents(
        self,
        repo: RepoInfo, 
        path: str,
    ) -> tuple[Optional[str], bool]:
        """
        Fetch the contents from github file/directory

        Args:
            repo: info related to the requested repo to fetch
            path: relative path to the file/directory

        Returns:
            The content of the file/directory as string
            Boolean as the status of the operation

        Raises:
            GitHubApiError: If there's an issue communicating with the GitHub API
                            or if the response is unexpected.
        """
        headers = self._get_headers("application/vnd.github.raw+json")
        params = {}
        if self.ref:
            params["ref"] = self.ref

        url = f"https://api.github.com/repos/{repo.owner}/{repo.repo_name}/contents/{path}"
        
        try:
            response = await self.client.get(url, headers=headers, params=params, follow_redirects=True)

            if response.status_code == 404:
                error_msg = f"File/Directory not found: {path} in {repo.owner}/{repo.repo_name}@{self.ref or 'default branch'}"
                utils.logger.info(f"GitHubTools.get_file_contents(): {error_msg}")
                return None, False
            response.raise_for_status()

            # returned_content_type = response.headers["Content-Type"]
            # if returned_content_type == "application/json; charset=utf-8": # this is a dir, so format it and return
            #     data = response.json()
            #     return _format_github_tree_structure(data, f"{repo.owner}/{repo.repo_name}", None), True
            # else it's a raw text of file content
            return response.text, True

        except httpx.HTTPStatusError as e:
            utils.logger.error(f"GitHub API error fetching file/directory {path}@{self.ref or 'default'}: {e.response.status_code} - {e.response.text}")
            raise GitHubApiError(f"GitHub API error: {e.response.status_code}", status_code=e.response.status_code, details=e.response.text) from e
        except Exception as e:
            utils.logger.error(f"Error fetching or decoding file/directory {path}@{self.ref or 'default'}: {e}")
            raise GitHubApiError(f"Failed to process contents: {str(e)}") from e

    async def list_directory_files(
        self,
        repo: RepoInfo, 
        path: str = "",
    ) -> tuple[Optional[list[str]], bool]:
        """
        Fetch the contents from github directory

        Args:
            repo: info related to the requested repo to fetch
            path: the file path. Default to the root (empty string)

        Returns:
            A list of filepaths from given directory
            Boolean as the status of the operation

        Raises:
            GitHubApiError: If there's an issue communicating with the GitHub API
                            or if the response is unexpected.
        """
        headers = self._get_headers()
        params = {}
        if self.ref:
            params["ref"] = self.ref

        # Handle root path correctly
        clean_path = path.strip("/")
        url = f"https://api.github.com/repos/{repo.owner}/{repo.repo_name}/contents/{clean_path}"
        
        try:
            response = await self.client.get(url, headers=headers, params=params, follow_redirects=True)

            if response.status_code == 404:
                error_msg = f"File/Directory not found: {path} in {repo.owner}/{repo.repo_name}@{self.ref or 'default branch'}"
                utils.logger.error(f"GitHubTools.list_directory_files(): {error_msg}")
                return None, False
            response.raise_for_status()

            data = response.json()
            if isinstance(data, list):  # Directory listing
                file_list = []
                for content in data:
                    if content["type"] == "file":  # get file only, ignore directory
                        file_list.append(content["path"])
                return file_list, True
                
            # else it's a file content (not a list), which isn't what we want here
            return None, False

        except httpx.HTTPStatusError as e:
            utils.logger.error(f"GitHub API error fetching file/directory {path}@{self.ref or 'default'}: {e.response.status_code} - {e.response.text}")
            raise GitHubApiError(f"GitHub API error: {e.response.status_code}", status_code=e.response.status_code, details=e.response.text) from e
        except Exception as e:
            utils.logger.error(f"Error fetching or decoding file/directory {path}@{self.ref or 'default'}: {e}")
            raise GitHubApiError(f"Failed to process contents: {str(e)}") from e

    @staticmethod
    def _build_hierarchical_tree(flat_tree_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Converts a flat list of GitHub tree entries into a hierarchical
        nested dictionary structure.
        """
        tree_root: Dict[str, Any] = {}
        for item in flat_tree_list:
            path_parts = item.get("path", "").split('/')
            current_level = tree_root
            for i, part in enumerate(path_parts):
                if not part:  # Should not happen with valid GitHub paths
                    continue
                
                is_last_part = (i == len(path_parts) - 1)
                
                if is_last_part:
                    # It's a file or an explicitly listed empty directory from the flat list
                    current_level[part] = {"_type": item.get("type", "blob")}  # 'blob/file' or 'tree/dir'
                else:
                    # It's a directory segment in the path
                    if part not in current_level:
                        current_level[part] = {"_type": "tree", "children": {}}
                    elif "_type" not in current_level[part] or current_level[part]["_type"] not in ("tree", "dir"):
                        current_level[part] = {"_type": "tree", "children": {}}
                    
                    # Ensure 'children' exists if we are treating 'part' as a tree
                    if "children" not in current_level[part]:
                        current_level[part]["children"] = {}

                    current_level = current_level[part]["children"]
        return tree_root

    @staticmethod
    def _format_tree_recursively(
        tree_node: Dict[str, Any],
        current_prefix: str,
        lines_list: List[str],
        current_depth: int,
        max_depth: Optional[int]
    ):
        """
        Recursively traverses the hierarchical tree and formats it into a list of strings.
        """
        if max_depth is not None and current_depth >= max_depth:
            return

        sorted_item_names = sorted(tree_node.keys())
        
        for i, name in enumerate(sorted_item_names):
            item_data = tree_node[name]
            is_last_child = (i == len(sorted_item_names) - 1)
            
            connector = "└── " if is_last_child else "├── "
            line = current_prefix + connector + name
            
            is_directory = item_data.get("_type") == "tree"
            if is_directory:
                line += "/"  # Add trailing slash for directories
            
            lines_list.append(line)
            
            if is_directory and "children" in item_data and item_data["children"]:
                new_prefix = current_prefix + ("    " if is_last_child else "│   ")
                GitHubTools._format_tree_recursively(
                    item_data["children"],
                    new_prefix,
                    lines_list,
                    current_depth + 1,
                    max_depth
                )

    @classmethod
    def _format_github_tree_structure(
        cls,
        flat_tree_list: List[Dict[str, Any]],
        repo_name_with_owner: str,
        max_depth: Optional[int] = None
    ) -> str:
        """
        Formats a flat list of GitHub tree entries into a human-readable,
        indented tree structure string, with optional depth control.

        Args:
            flat_tree_list: The list of tree entries from GitHub API
            repo_name_with_owner: The name of the repository (e.g., "owner/repo") to use as the root.
            max_depth: Optional maximum depth to display the tree.
                        Depth 0 means only the root repo name.
                        Depth 1 means root repo name and its direct children.
                        None means full depth.

        Returns:
            A string representing the formatted directory tree.
        """
        if not flat_tree_list:
            return f"Directory structure:\n└── {repo_name_with_owner}/\n    (Repository is empty or tree data not available)"

        hierarchical_tree = cls._build_hierarchical_tree(flat_tree_list)
        
        lines = ["Directory structure:"]
        
        if max_depth is not None and max_depth < 0:
            lines.append(f"└── {repo_name_with_owner}/")
            return "\n".join(lines)

        lines.append(f"└── {repo_name_with_owner}/")
        
        effective_max_depth_for_children = None
        if max_depth is not None:
            effective_max_depth_for_children = max_depth - 1

        cls._format_tree_recursively(
            tree_node=hierarchical_tree,
            current_prefix="    ",
            lines_list=lines,
            current_depth=0,
            max_depth=effective_max_depth_for_children
        )
        
        return "\n".join(lines)

    async def fetch_directory_tree_with_depth(
        self,
        repo: RepoInfo,
        depth: Optional[int] = 1,
        full_depth: Optional[bool] = False,
    ) -> str:
        """
        Fetch the tree from github and format it to be LLM-friendly

        Args:
            repo: info related to the requested repo to fetch
            depth: The specified depth of the tree in int
            full_depth: Boolean for fetching tree with full depth

        Returns:
            A string representing the formatted directory tree.

        Raises:
            GitHubApiError: If there's an issue communicating with the GitHub API
                            or if the response is unexpected.
        """
        headers = self._get_headers()
        ref = self.ref

        # 1. Get the ref to use (default branch if None)
        if not ref:
            repo_info_url = f"https://api.github.com/repos/{repo.owner}/{repo.repo_name}"
            try:
                repo_info_resp = await self.client.get(repo_info_url, headers=headers)
                repo_info_resp.raise_for_status()
                ref = repo_info_resp.json().get("default_branch", "main")
            except Exception as e:
                raise GitHubApiError(
                    message=f"Failed to fetch default branch for {repo.owner}/{repo.repo_name}: {str(e)}",
                    status_code=getattr(e, 'response', None) and getattr(e.response, 'status_code', None)
                ) from e

        # 2. Get the tree recursively
        tree_url = f"https://api.github.com/repos/{repo.owner}/{repo.repo_name}/git/trees/{ref}?recursive=1"

        utils.logger.info(f"Fetching tree from: {tree_url}")
        try:
            tree_resp = await self.client.get(tree_url, headers=headers)
            
            if tree_resp.status_code == 404:
                raise GitHubApiError(
                    message=f"Tree or ref '{ref}' not found for {repo.owner}/{repo.repo_name}. Or repository is private/inaccessible.",
                    status_code=404,
                    details=tree_resp.text
                )
            if tree_resp.status_code == 409:  # Conflict - often for empty repository
                utils.logger.warning(f"Warning: Received 409 Conflict for tree {repo.owner}/{repo.repo_name}@{ref}. Likely an empty repository.")
                return ""

            tree_resp.raise_for_status()
            
            tree_data = tree_resp.json()

            if tree_data.get("truncated"):
                utils.logger.warning(f"Warning: Tree data for {repo.owner}/{repo.repo_name}@{ref} was truncated by GitHub API.")

            return self._format_github_tree_structure(
                tree_data["tree"], 
                f"{repo.owner}/{repo.repo_name}", 
                max_depth=None if full_depth else depth
            )

        except httpx.HTTPStatusError as e:
            raise GitHubApiError(
                message=f"GitHub API HTTP error fetching tree for {repo.owner}/{repo.repo_name}@{ref}: {e.response.status_code}",
                status_code=e.response.status_code,
                details=e.response.text
            ) from e
        except httpx.RequestError as e:
            raise GitHubApiError(message=f"HTTP request failed while fetching tree for {repo.owner}/{repo.repo_name}@{ref}: {str(e)}") from e
        except Exception as e:
            raise GitHubApiError(message=f"An unexpected error occurred while fetching tree for {repo.owner}/{repo.repo_name}@{ref}: {str(e)}") from e

    async def get_repo_context(
        self, repo: RepoInfo, status_callback: Optional[Callable[[str], None]] = None
    ) -> tuple[str, bool]:
        """
        Fetch key files in the repo to get general context.

        Args:
            repo: info related to the requested repo to fetch
            status_callback: optional callback invoked with stage names for SSE (fetching_tree, exploring_files, fetching_files)

        Returns:
            A string of concatenated content of key files found in root directory
            Boolean as the status of the operation
        """
        try:
            context_parts = []
            total_chars = 0

            # Context #1: Repo structure
            tree = await self.fetch_directory_tree_with_depth(repo=repo, depth=self.TREE_DEPTH)
            if len(tree) > 10000:
                tree = "(Tree content cropped to 10k characters)\n" + tree[:10000]
            context_parts.append(tree + "\n")
            total_chars += len(tree)
            if status_callback:
                status_callback("fetching_tree")

            # Context #2: File content (agentic: LLM suggests paths + IMPORTANT_FILES, fetch in parallel)
            result = await self.list_directory_files(repo, "")
            if not result[1] or not result[0]:
                return "Error with getting files at root directory", False

            files_at_root = set(result[0])
            root_important = [f for f in self.IMPORTANT_FILES if f in files_at_root]
            if status_callback:
                status_callback("exploring_files")
            llm_paths = await ClaudeService.get_files_to_explore(tree)
            all_paths = list(dict.fromkeys(root_important + llm_paths))[: self.MAX_FILES_TO_FETCH]

            if not all_paths:
                return "No key documentation files found in root.", True

            if status_callback:
                status_callback("fetching_files")
            tasks = [self.get_file_contents(repo, p) for p in all_paths]
            results = await asyncio.gather(*tasks)

            for path, (content, success) in zip(all_paths, results):
                if success and content:
                    if len(content) > self.MAX_FILE_CHARS:
                        content = content[: self.MAX_FILE_CHARS] + "\n... (file truncated for length)\n"
                    add_len = len(content)
                    if total_chars + add_len > self.MAX_TOTAL_CHARS:
                        context_parts.append("(Remaining files skipped to stay under context limit.)\n")
                        break
                    context_parts.append(f"================================================\nFILE: {path}\n================================================\n{content}\n")
                    total_chars += add_len

            return "\n".join(context_parts), True

        except Exception as e:
            utils.logger.error(f"GitHubTools.get_repo_context(): {e}")
            return str(e), False


# For testing
async def main():
    async with httpx.AsyncClient() as client:
        github = GitHubTools(client, github_token=None, ref=None)
        repo = RepoInfo(owner="baonguyen09", repo_name="github-second-brain")
        content, success = await github.get_repo_context(repo)
        if success:
            response = await ClaudeService.explain_repo(repo, content)
            print(response[0])
        else:
            print(f"Failed: {content}")


if __name__ == "__main__":
    asyncio.run(main())
