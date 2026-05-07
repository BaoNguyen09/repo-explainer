"""Prompts used for AI provider interactions."""

from functools import lru_cache
from pathlib import Path
import re
from typing import List, Optional

# --- Files-to-explore (agentic discovery: LLM suggests paths from tree) ---

FILES_TO_EXPLORE_SYSTEM = """You are a principal engineer. Given a repository's directory tree, you must choose which files are most valuable to read to understand the codebase (purpose, architecture, key config).

CRITICAL PATH RULES:
- The tree below has a root label like `└── owner/repo/`. That label is for display ONLY and is NOT part of any file path. Paths start from the FIRST LEVEL INSIDE that root.
- Example: if the tree shows:
    └── fastapi/fastapi/
        ├── README.md
        ├── fastapi/
        │   ├── applications.py
  then the correct paths are `README.md` and `fastapi/applications.py`.
  WRONG: `fastapi/fastapi/README.md` or `fastapi/fastapi/fastapi/applications.py`.
- Return ONLY file paths (not directories), one per line. No explanations, no bullets, no markdown.
- Prioritize: README/docs, config (package.json, requirements.txt, etc.), main entry points, and key source files. Prefer a small set (up to 15 paths) so the list stays focused.

Output format: plain text, exactly one path per line. Example:

README.md
package.json
src/main.py
src/utils.py
"""

FILES_TO_EXPLORE_USER_TEMPLATE = """Directory tree of the repository:
List the file paths to read (one per line, relative to repo root). No other text.

<tree>
{tree}
</tree>
"""


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

SYSTEM_PROMPT = """You are a staff software engineer. Explain GitHub repositories 
clearly and thoroughly for curious developers who want to deeply understand the codebase.
Produce the answer in Markdown format.

Aim for a detailed explanation (roughly 1500 words when the repository is non-trivial), with concrete examples and specifics from the provided context. Do not be overly terse unless the repository itself is extremely small.

MANDATORY REQUIREMENTS:
1. You MUST ALWAYS include the repository directory structure in tree format.
2. The directory structure MUST come AFTER any Mermaid diagrams showing component connections.
3. The directory structure MUST be formatted as a shell code block using tree characters (├──, └──, │).
4. The structure should show the main directories and important files, typically 2-3 levels deep.
5. Whenever you mention any repository file or folder in prose, you MUST use its full repo-relative path from the repository root, not just the basename.
6. Prefer exact paths taken from the provided tree or `FILE:` headers. Example: write `src/server.c`, not `server.c`.

GROUNDING AND ACCURACY RULES:
1. Treat the provided repository context as the source of truth for repo-specific facts.
2. Do NOT invent or overstate history, popularity, intended audience, documentation usage, CI/CD usage, or community significance unless it is explicitly supported by the repository context.
3. If you infer something from file names or structure, say it is an inference.
4. For tiny repositories, stay brief instead of padding with external lore.
5. Only include command examples that are valid, standard commands and directly relevant to this repository. If unsure, omit the command.
6. Do not use unverifiable labels like "canonical", "legendary", "famous", or "load-bearing" unless the repository context itself supports them.
7. Do not explain what repositories of this kind "typically", "usually", or "often" do unless the repository context states that purpose. If the purpose is not explicit, say what the files show and avoid guessing intent.
8. Do not state a repository's "purpose", "intended use", or "why it exists" unless that is explicit in README, package metadata, repository metadata, or another provided source. Otherwise describe only the visible contents and behavior.

REQUIRED FORMAT FOR DIRECTORY STRUCTURE:
Include a section like this AFTER the diagram section:

## Repository Structure

```shell
repo-name/
├── backend/
│   ├── main.py
│   ├── ai_service.py
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
4. Use mermaid ONLY for visual flow/connection diagrams, NEVER for directory structures.
5. The repository structure section MUST appear AFTER any Mermaid diagrams.

MERMAID SYNTAX RULES (follow strictly to avoid parse errors):
- Use simple node IDs (A, B, C, N1, N2). Put display text in the label only.
- Any label containing parentheses, brackets [], slashes /, spaces, or colons MUST be wrapped in double quotes inside the brackets: A["Frontend (React + Vite)"], B["GET /owner/repo/stream"].
- Write each statement on ONE line. Do not split a node or arrow across multiple lines.
- For arrow labels use quotes: A -->|"label text"| B. No spaces in the label key; use one word or quoted text.
- Do not use raw [ or ] inside a label unless the entire label is already in double quotes (e.g. A["Path [optional]"] is OK).
- Example of valid diagram:
  ```mermaid
  graph TD
      A["Frontend"] --> B["Backend"]
      B --> C["GitHub API"]
  ```"""

USER_PROMPT_TEMPLATE = """{user_instructions_section}Explain this repository: {repo_name}

You MUST structure the answer into exactly these 4 Markdown sections using level-2 headings (##):

## 1. What is this repo?
- Brief overview of the repository's purpose and functionality.

## 2. How all main components connect
- Explain the architecture and how components interact.
- Use Mermaid diagrams for visual flow if helpful.
- Place any Mermaid diagram in this section.

## 3. Repository Structure  (MUST come after the diagram)
- Display the directory tree structure in a shell code block.
- Use tree characters (├──, └──, │) to show hierarchy.
- Include main directories and important files (2-3 levels deep).
- Format: ```shell followed by the tree structure.

## 4. Other important information
- Tech stack, key features, setup instructions, or any other relevant details.

Remember: The Repository Structure section MUST be included AFTER any Mermaid diagrams and formatted as a shell code block with tree characters.
Repository context:
{repo_context}
"""


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


CHAT_SYSTEM_TEMPLATE = """You are a knowledgeable assistant helping a developer understand the {owner}/{repo} repository.

You have been given:
1. A previously generated explanation of the repository.
2. The repository's directory tree structure.

You also have tools to read specific files or list directory contents when you need more detail to answer accurately.

GUIDELINES:
- Use tools judiciously, only fetch files when the provided context does not have enough information to answer.
- Be concise and reference specific file paths and code when relevant.
- Whenever you mention a repository file or directory, use the full repo-relative path from the repository root, never just the basename.
- Format your response in Markdown.
- When showing code, use fenced code blocks with the appropriate language tag.
- If the user asks about something not in the repository, say so clearly.
{style_instruction}

REPOSITORY EXPLANATION:
{explanation}

DIRECTORY TREE:
{tree}"""


@lru_cache(maxsize=1)
def load_caveman_prompt() -> str:
    """Load the full caveman mode instructions from the repo prompt asset."""
    return (Path(__file__).resolve().parent / "prompt_assets" / "caveman.md").read_text(encoding="utf-8").strip()


def build_chat_system_prompt(
    owner: str,
    repo: str,
    explanation: str,
    tree: str,
    style: str = "normal",
) -> str:
    """Build the system prompt for a chat-with-repo conversation."""
    style_instruction = ""
    if style == "caveman":
        style_instruction = (
            "- Style mode active: caveman, full intensity. Apply the following instructions for every chat response unless the user explicitly asks for normal mode.\n"
            f"{load_caveman_prompt()}\n"
        )

    return CHAT_SYSTEM_TEMPLATE.format(
        owner=owner,
        repo=repo,
        explanation=explanation,
        tree=tree,
        style_instruction=style_instruction,
    )

