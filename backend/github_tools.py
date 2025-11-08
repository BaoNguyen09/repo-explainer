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