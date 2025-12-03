import asyncio
import sys
from typing import Any, Dict, List, Optional
import httpx

from schema import GitHubApiError, RepoInfo
import utils

__all__ = ["GitHubTools"]

class GitHubTools():

    IMPORTANT_FILES = [ # in order of priority
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

    # SKIP_PATTERNS = [ No need right now since i'm using allowed list
    #     '__pycache__', 'node_modules', '.git', 'dist', 'build',
    #     '.next', '.venv', 'venv', '.idea', '.vscode',
    #     '*.min.js', '*.min.css', '.DS_Store',
    # ]

    TREE_DEPTH = 3  # Just top-level structures
    MAX_TOTAL_CHARS = 100_000  # ~25k tokens or 100kb

    @classmethod
    async def get_file_contents(
        cls,
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
                utils.logger.info(f"{cls.__name__}.get_file_contents(): {error_msg}")
                return None, False
            response.raise_for_status()

            # returned_content_type = response.headers["Content-Type"]
            # if returned_content_type == "application/json; charset=utf-8": # this is a dir, so format it and return
            #     data = response.json()
            #     return format_github_tree_structure(data, f"{repo.owner}/{repo.repo_name}", None), True
            # else it's a raw text of file content
            return response.text, True

        except httpx.HTTPStatusError as e:
            utils.logger.error(f"GitHub API error fetching file/directory {path}@{ref or 'default'}: {e.response.status_code} - {e.response.text}")
            raise GitHubApiError(f"GitHub API error: {e.response.status_code}", status_code=e.response.status_code, details=e.response.text) from e
        except Exception as e:
            utils.logger.error(f"Error fetching or decoding file/directory {path}@{ref or 'default'}: {e}")
            raise GitHubApiError(f"Failed to process contents: {str(e)}") from e

    @classmethod
    async def list_directory_files(
        cls,
        repo: RepoInfo, 
        http_client: httpx.AsyncClient,
        path: str = "",
        ref: Optional[str] = None,
        github_token: Optional[str] = None,
    ) -> tuple[Optional[list[str]], bool]:
        """
        Fetch the contents from github directory

        Args:
            repo: info related to the requested repo to fetch
            http_client: An instance of httpx.AsyncClient for making requests
            path: the file path. Default to the root (empty string)
            ref: The name of the commit/branch/tag. Default: the repository’s default branch
            github_token: Optional GitHub API token for authentication

        Returns:
            A list of filepaths from given directory
            Boolean as the status of the operation

        Raises:
            GitHubApiError: If there's an issue communicating with the GitHub API
                            or if the response is unexpected.
        """
        headers = {
            "Accept": "application/vnd.github.v3+json", # Standard JSON for listing
            "X-GitHub-Api-Version": "2022-11-28"
        }
        if github_token:
            headers["Authorization"] = f"Bearer {github_token}"
        params = {}
        if ref:
            params["ref"] = ref

        # Handle root path correctly
        clean_path = path.strip("/")
        url = f"https://api.github.com/repos/{repo.owner}/{repo.repo_name}/contents/{clean_path}"
        
        try:
            response = await http_client.get(url, headers=headers, params=params, follow_redirects=True) # Allow redirects for raw content

            if response.status_code == 404:
                error_msg = f"File/Directory not found: {path} in {repo.owner}/{repo.repo_name}@{ref or 'default branch'}"
                utils.logger.error(f"{cls.__name__}.list_directory_files(): {error_msg}")
                return None, False
            response.raise_for_status()

            data = response.json()
            if isinstance(data, list): # Directory listing
                file_list = []
                for content in data:
                    if content["type"] == "file": # get file only, ignore directory
                        file_list.append(content["path"])
                return file_list, True
                
            # else it's a file content (not a list), which isn't what we want here
            return None, False

        except httpx.HTTPStatusError as e:
            utils.logger.error(f"GitHub API error fetching file/directory {path}@{ref or 'default'}: {e.response.status_code} - {e.response.text}")
            raise GitHubApiError(f"GitHub API error: {e.response.status_code}", status_code=e.response.status_code, details=e.response.text) from e
        except Exception as e:
            utils.logger.error(f"Error fetching or decoding file/directory {path}@{ref or 'default'}: {e}")
            raise GitHubApiError(f"Failed to process contents: {str(e)}") from e

    @classmethod
    def _build_hierarchical_tree(cls, flat_tree_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Converts a flat list of GitHub tree entries into a hierarchical
        nested dictionary structure.
        """
        tree_root: Dict[str, Any] = {}
        for item in flat_tree_list:
            path_parts = item.get("path", "").split('/')
            current_level = tree_root
            for i, part in enumerate(path_parts):
                if not part: # Should not happen with valid GitHub paths
                    continue
                
                is_last_part = (i == len(path_parts) - 1)
                
                if is_last_part:
                    # It's a file or an explicitly listed empty directory from the flat list
                    current_level[part] = {"_type": item.get("type", "blob")} # 'blob/file' or 'tree/dir'
                else:
                    # It's a directory segment in the path
                    if part not in current_level:
                        current_level[part] = {"_type": "tree", "children": {}}
                    elif "_type" not in current_level[part] or current_level[part]["_type"] not in ("tree", "dir"):
                        # This case handles if a file and directory have the same prefix,
                        # though unlikely with standard git structures. Prioritize tree structure.
                        current_level[part] = {"_type": "tree", "children": {}}
                    
                    # Ensure 'children' exists if we are treating 'part' as a tree
                    if "children" not in current_level[part]:
                        current_level[part]["children"] = {}

                    current_level = current_level[part]["children"]
        return tree_root

    @classmethod
    def _format_tree_recursively(
        cls,
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

        # Sort items: directories first (by type), then alphabetically by name
        # GitHub API usually returns items sorted, but explicit sort is safer.
        sorted_item_names = sorted(tree_node.keys())
        
        for i, name in enumerate(sorted_item_names):
            item_data = tree_node[name]
            is_last_child = (i == len(sorted_item_names) - 1)
            
            connector = "└── " if is_last_child else "├── "
            line = current_prefix + connector + name
            
            is_directory = item_data.get("_type") == "tree"
            if is_directory:
                line += "/" # Add trailing slash for directories
            
            lines_list.append(line)
            
            if is_directory and "children" in item_data and item_data["children"]:
                new_prefix = current_prefix + ("    " if is_last_child else "│   ")
                cls._format_tree_recursively(
                    item_data["children"],
                    new_prefix,
                    lines_list,
                    current_depth + 1,
                    max_depth
                )

    @classmethod
    def format_github_tree_structure(
        cls,
        flat_tree_list: List[Dict[str, Any]],
        repo_name_with_owner: str, # e.g., "baonguyen09/github-second-brain"
        max_depth: Optional[int] = None
    ) -> str:
        """
        Formats a flat list of GitHub tree entries into a human-readable,
        indented tree structure string, with optional depth control.

        Args:
            flat_tree_list: The list of tree entries from GitHub API
                            (e.g., from fetch_recursive_tree_from_github).
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
        
        # Handle max_depth for the root line itself
        if max_depth is not None and max_depth < 0: # Or treat 0 as only root
            lines.append(f"└── {repo_name_with_owner}/")
            return "\n".join(lines)

        lines.append(f"└── {repo_name_with_owner}/")
        
        # The children of the root are at depth 0 for _format_tree_recursively
        # So, if max_depth is 1, we want _format_tree_recursively to process current_depth 0.
        # The max_depth for the recursive formatter should be relative to the repo root's children.
        effective_max_depth_for_children = None
        if max_depth is not None:
            effective_max_depth_for_children = max_depth -1 # if max_depth=1, children_depth=0

        cls._format_tree_recursively(
            tree_node=hierarchical_tree,
            current_prefix="    ", # Initial indent for children of the root
            lines_list=lines,
            current_depth=0, # Children of root are at depth 0 of the repo content tree
            max_depth=effective_max_depth_for_children
        )
        
        return "\n".join(lines)

    @classmethod
    async def fetch_directory_tree_with_depth(
        cls,
        repo: RepoInfo,
        http_client: httpx.AsyncClient,
        ref: Optional[str] = None,
        github_token: Optional[str] = None,
        depth: Optional[int] = 1,
        full_depth: Optional[bool] = False,
    ) -> str:
        """
        Fetch the tree from github and format it to be LLM-friendly

        Args:
            repo: info related to the requested repo to fetch
            http_client: An instance of httpx.AsyncClient for making requests
            ref: Branch name, tag, or commit SHA of specified tree
            github_token: Optional GitHub API token for authentication
            depth: The specified depth of the tree in int
            full_depth: Boolean for fetching tree with full depth

        Returns:
            A string representing the formatted directory tree.

        Raises:
            GitHubApiError: If there's an issue communicating with the GitHub API
                            or if the response is unexpected.
        """
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }
        if github_token:
            headers["Authorization"] = f"Bearer {github_token}"

        # 1. Get the ref to use (default branch if None)
        if not ref: # fetch repo info to get defaul branch name
            repo_info_url = f"https://api.github.com/repos/{repo.owner}/{repo.repo_name}"
            try:
                repo_info_resp = await http_client.get(repo_info_url, headers=headers)
                repo_info_resp.raise_for_status()
                ref = repo_info_resp.json().get("default_branch", "main") # Fallback to main if somehow not found
            except Exception as e:
                raise GitHubApiError(
                    message=f"Failed to fetch default branch for {repo.owner}/{repo.repo_name}: {str(e)}",
                    status_code=getattr(e, 'response', None) and getattr(e.response, 'status_code', None)
                ) from e

        # 2. Get the tree recursively
        tree_url = f"https://api.github.com/repos/{repo.owner}/{repo.repo_name}/git/trees/{ref}?recursive=1"

        utils.logger.info(f"Fetching tree from: {tree_url}")
        try:
            tree_resp = await http_client.get(tree_url, headers=headers)
            
            if tree_resp.status_code == 404:
                # This can happen if the ref (branch/tag/commit/tree_sha) doesn't exist
                # or if the repository itself is not found or is private without auth.
                raise GitHubApiError(
                    message=f"Tree or ref '{ref}' not found for {repo.owner}/{repo.repo_name}. Or repository is private/inaccessible.",
                    status_code=404,
                    details=tree_resp.text
                )
            if tree_resp.status_code == 409: # Conflict - often for empty repository
                utils.logger.warning(f"Warning: Received 409 Conflict for tree {repo.owner}/{repo.repo_name}@{ref}. Likely an empty repository. Returning empty tree.")
                return []

            tree_resp.raise_for_status() # For other HTTP errors
            
            tree_data = tree_resp.json()

            if tree_data.get("truncated"):
                utils.logger.warning(f"Warning: Tree data for {repo.owner}/{repo.repo_name}@{ref} was truncated by GitHub API. The returned list might be incomplete.")

            return cls.format_github_tree_structure(tree_data["tree"], f"{repo.owner}/{repo.repo_name}", max_depth=None if full_depth else depth)

        except httpx.HTTPStatusError as e:
            raise GitHubApiError(
                message=f"GitHub API HTTP error fetching tree for {repo.owner}/{repo.repo_name}@{ref}: {e.response.status_code}",
                status_code=e.response.status_code,
                details=e.response.text
            ) from e
        except httpx.RequestError as e:
            raise GitHubApiError(message=f"HTTP request failed while fetching tree for {repo.owner}/{repo.repo_name}@{ref}: {str(e)}") from e
        except Exception as e: # Catch-all for other unexpected errors like JSON decoding
            raise GitHubApiError(message=f"An unexpected error occurred while fetching tree for {repo.owner}/{repo.repo_name}@{ref}: {str(e)}") from e

    @classmethod
    async def get_repo_context(
        cls,
        repo: RepoInfo, 
        http_client: httpx.AsyncClient,
        ref: Optional[str] = None,
        github_token: Optional[str] = None,
    ) -> tuple[str, bool]:
        """
        Fetch key files in the repo to get general context

        Args:
            repo: info related to the requested repo to fetch
            http_client: An instance of httpx.AsyncClient for making requests
            ref: The name of the commit/branch/tag. Default: the repository’s default branch
            github_token: Optional GitHub API token for authentication

        Returns:
            A string of concatenated content of key files found in root directory
            Boolean as the status of the operation
        """
        try:
            context_parts = []
            total_chars = 0
            # Context #1: Repo structure
            ##########################
            tree = await cls.fetch_directory_tree_with_depth(repo=repo, http_client=http_client, depth=cls.TREE_DEPTH)
            if len(tree) > 10000:
                tree = "(Tree content cropped to 10k characters)\n" + tree[:10000]
            context_parts.append(tree + "\n")
            total_chars += len(tree)

            # Context #2: File content
            ##########################
            # 1. List files
            result = await cls.list_directory_files(repo, http_client, "", ref, github_token)
            if not result[1] or not result[0]:
                return "Error with getting files at root directory", False

            files_at_root = set[str](result[0])
            tasks = []
            files_to_fetch = []

            # 2. Queue up tasks for important files
            for filename in cls.IMPORTANT_FILES:
                if filename in files_at_root:
                    tasks.append(cls.get_file_contents(repo, filename, http_client, ref, github_token))
                    files_to_fetch.append(filename)
            
            if not tasks:
                return "No key documentation files found in root.", True

            # 3. Run in parallel
            results = await asyncio.gather(*tasks)
            
            # 4. Combine results
            for filename, (content, success) in zip(files_to_fetch, results):
                if success and content:
                    if total_chars > cls.MAX_TOTAL_CHARS:
                        context_parts.append("(Files content cropped to 100k characters)\n")
                        break

                    context_parts.append(f"================================================\nFILE: {filename}\n================================================\n{content}\n")
                    total_chars += len(content)  # stop after the new content exceed limit

            return "\n".join(context_parts), True

        except Exception as e:
            utils.logger.error(f"{cls.__name__}.get_repo_context(): {e}")
            return str(e), False