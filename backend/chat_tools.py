"""
Tool definitions and executor for the chat-with-repo feature.

Wraps GitHubTools methods so the AI can fetch files and list directories
during a conversation.
"""

from typing import Any

from backend import utils
from backend.github_tools import GitHubTools
from backend.schema import RepoInfo

CHAT_TOOLS: list[dict[str, Any]] = [
    {
        "name": "read_file",
        "description": (
            "Read the contents of a specific file in the repository. "
            "Returns the raw text content of the file. "
            "Use this when you need to inspect code or configuration."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path relative to repository root, for example 'src/main.py'.",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "list_directory",
        "description": (
            "List files in a directory of the repository. "
            "Use this to explore the repo before reading a specific file."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Directory path relative to repository root. Use empty string for root.",
                },
            },
            "required": ["path"],
        },
    },
]


async def execute_tool(
    tool_name: str,
    tool_input: dict[str, Any],
    github: GitHubTools,
    repo: RepoInfo,
) -> str:
    """Execute a tool call and return the result string."""
    try:
        if tool_name == "read_file":
            path = tool_input.get("path", "")
            content, success = await github.get_file_contents(repo, path)
            if not success or content is None:
                return f"Error: File not found at path '{path}'"
            if len(content) > GitHubTools.MAX_FILE_CHARS:
                content = content[: GitHubTools.MAX_FILE_CHARS] + "\n... (file truncated)"
            return content

        if tool_name == "list_directory":
            path = tool_input.get("path", "")
            files, success = await github.list_directory_files(repo, path)
            if not success or files is None:
                return f"Error: Directory not found at path '{path}'"
            if not files:
                return f"Directory '{path}' is empty (no files, only subdirectories)."
            return "\n".join(files)

        return f"Error: Unknown tool '{tool_name}'"
    except Exception as e:
        utils.logger.warning("chat_tools.execute_tool(%s) failed: %s", tool_name, e)
        return f"Error executing tool '{tool_name}': {str(e)}"
