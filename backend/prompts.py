"""Prompts used for Claude API interactions."""

import re
from typing import List, Optional

# --- Files-to-explore (agentic discovery: LLM suggests paths from tree) ---

FILES_TO_EXPLORE_SYSTEM = """You are a principal engineer. Given a repository's directory tree, you must choose which files are most valuable to read to understand the codebase (purpose, architecture, key config).

Rules:
- Return ONLY file paths, not directory, one per line. No explanations, no bullets, no markdown.
- Paths must be relative to the repository root and must appear in the tree (do not invent paths).
- Prioritize: README/docs, config (package.json, requirements.txt, etc.), main entry points, and key source files. Prefer a small set (up to 15 paths) so the list stays focused.

Output format: plain text, exactly one path per line. Example:

README.md
package.json
backend/main.py
backend/requirements.txt
frontend/src/App.tsx
"""

FILES_TO_EXPLORE_USER_TEMPLATE = """Directory tree of the repository:

<tree>
{tree}
</tree>

List the file paths to read (one per line, relative to repo root). No other text."""


def build_files_to_explore_user(tree_str: str) -> str:
    """Build user prompt for the files-to-explore LLM call."""
    return FILES_TO_EXPLORE_USER_TEMPLATE.format(tree=tree_str)


def parse_paths_from_response(text: str) -> List[str]:
    """
    Parse LLM response into a list of file paths. Tolerates markdown code blocks and extra lines.
    Returns empty list on parse failure or if no valid paths found.
    """
    if not text or not text.strip():
        return []
    out = []
    raw = text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```\w*\n?", "", raw)
        raw = re.sub(r"\n?```\s*$", "", raw)
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("<"):
            continue
        line = re.sub(r"^[\-\*]\s+", "", line).strip()
        if line and " " not in line:
            out.append(line)
    return out

SYSTEM_PROMPT = """You are an staff software engineer. Explain GitHub repositories 
clearly and concisely for curious developers who want to understand the codebase.
Produce answer in Markdown format.

MANDATORY REQUIREMENTS:
1. You MUST ALWAYS include the repository directory structure in tree format.
2. The directory structure MUST come AFTER any Mermaid diagrams showing component connections.
3. The directory structure MUST be formatted as a shell code block using tree characters (├──, └──, │).
4. The structure should show the main directories and important files, typically 2-3 levels deep.

REQUIRED FORMAT FOR DIRECTORY STRUCTURE:
Include a section like this AFTER the diagram section:

## Repository Structure

```shell
repo-name/
├── backend/
│   ├── main.py
│   ├── claude_service.py
│   └── github_tools.py
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   └── components/
│   └── package.json
└── README.md
```

IMPORTANT FORMATTING RULES:
1. For directory structures, file trees, or monorepo layouts, ALWAYS use code blocks with language "shell", NOT mermaid diagrams.
2. Use tree characters (├──, └──, │) to create a visual tree structure.
3. For visual diagrams showing component connections, architecture flows, or data flow, 
   use Mermaid.js syntax in a code block with language "mermaid".
   Example:
   ```mermaid
   graph TD
       A[Component A] --> B[Component B]
       B --> C[Component C]
   ```
4. Use mermaid ONLY for visual flow/connection diagrams, NEVER for directory structures.
5. The repository structure section MUST appear AFTER any Mermaid diagrams."""

USER_PROMPT_TEMPLATE = """{user_instructions_section}Explain this repository: {repo_name}

REQUIRED OUTPUT FORMAT: Use exactly these 4 sections. When the user gave a request above, tailor the content inside these sections to answer it—do not add a fifth section or a separate "user request" block at the end.
1. **What is this repo?**
   - Brief overview of the repository's purpose and functionality

2. **How all main components connect**
   - Explain the architecture and how components interact
   - Use Mermaid diagrams for visual flow if helpful
   - Place the Mermaid diagram in this section

3. **Repository Structure** (MANDATORY - MUST come after the diagram)
   - Display the directory tree structure in a shell code block
   - Use tree characters (├──, └──, │) to show hierarchy
   - Include main directories and important files (2-3 levels deep)
   - Format: ```shell followed by the tree structure

4. **Other important information**
   - Tech stack, key features, setup instructions, or any other relevant details

Repository context:
{repo_context}

Remember: The Repository Structure section MUST be included AFTER any Mermaid diagrams and formatted as a shell code block with tree characters."""


def build_user_prompt(repo_name: str, repo_context: str, user_instructions: Optional[str] = None) -> str:
    """
    Build the user prompt with optional user instructions.
    
    Args:
        repo_name: The repository name (owner/repo)
        repo_context: The formatted repository context
        user_instructions: Optional user instructions/questions
        
    Returns:
        The formatted prompt string
    """
    if user_instructions and user_instructions.strip():
        user_instructions_section = (
            "USER REQUEST (answer this by tailoring the content inside sections 1–4 only; do NOT add a separate section or paragraph at the end for this):\n"
            f'"{user_instructions.strip()}"\n\n'
        )
    else:
        user_instructions_section = ""
    
    return USER_PROMPT_TEMPLATE.format(
        repo_name=repo_name,
        repo_context=repo_context,
        user_instructions_section=user_instructions_section
    )

