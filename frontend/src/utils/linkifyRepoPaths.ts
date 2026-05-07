const FENCED_CODE_BLOCK_RE = /(```[\s\S]*?```)/g;
const INLINE_CODE_RE = /(`[^`\n]+`)/g;

const ROOT_FILENAME_RE =
  /^(README|CHANGELOG|LICENSE|CONTRIBUTING|Dockerfile|Makefile|Procfile)(\.[A-Za-z0-9._-]+)?$/i;

const COMMON_ROOT_FILES = new Set([
  'package.json',
  'package-lock.json',
  'bun.lock',
  'pnpm-lock.yaml',
  'yarn.lock',
  'requirements.txt',
  'pyproject.toml',
  'uv.lock',
  'go.mod',
  'go.sum',
  'cargo.toml',
  'cargo.lock',
  'pom.xml',
  'build.gradle',
  'docker-compose.yml',
  'tsconfig.json',
  'vite.config.ts',
]);

const PATH_CANDIDATE_RE =
  /(?<![\w`/.-])(\.?\/?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/|\.?\/?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+|[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)(?![\w`/-])/g;

const TRAILING_PUNCTUATION_RE = /[),.;:!?]+$/;
const KNOWN_FILE_EXTENSIONS = new Set([
  'c',
  'cc',
  'cpp',
  'cs',
  'css',
  'go',
  'h',
  'hpp',
  'html',
  'java',
  'js',
  'json',
  'jsx',
  'kt',
  'md',
  'mjs',
  'php',
  'py',
  'rb',
  'rs',
  'scss',
  'sh',
  'sql',
  'svg',
  'toml',
  'ts',
  'tsx',
  'txt',
  'vue',
  'xml',
  'yaml',
  'yml',
  'zsh',
  'ini',
  'cfg',
  'conf',
  'lock',
  'env',
  'ps1',
]);
const KNOWN_DOTFILES = new Set([
  '.env',
  '.env.example',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.prettierrc',
  '.eslintrc',
  '.npmrc',
  '.nvmrc',
  '.tool-versions',
]);

interface RepoTreePaths {
  directories: Set<string>;
  files: Set<string>;
}

function extractRepoTreePaths(content: string): RepoTreePaths {
  const directories = new Set<string>();
  const files = new Set<string>();

  for (const block of content.matchAll(FENCED_CODE_BLOCK_RE)) {
    const codeBlock = block[0];
    if (!codeBlock.includes('├──') && !codeBlock.includes('└──')) {
      continue;
    }

    const stack: string[] = [];
    for (const rawLine of codeBlock.split(/\r?\n/)) {
      const branchIndex = rawLine.search(/[├└]──/);
      if (branchIndex < 0) {
        continue;
      }

      const depth = Math.floor(branchIndex / 4);
      const rawName = rawLine.slice(branchIndex + 3).trim();
      if (!rawName || rawName === '...' || rawName.includes(' ')) {
        continue;
      }

      const isDirectory = rawName.endsWith('/');
      const name = rawName.replace(/\/$/, '');
      if (!/^[A-Za-z0-9._-]+$/.test(name)) {
        continue;
      }

      stack[depth] = name;
      stack.length = depth + 1;

      const path = stack.join('/');
      if (isDirectory) {
        directories.add(path);
      } else {
        files.add(path);
      }
    }
  }

  return { directories, files };
}

function isLikelyDirectoryPath(candidate: string): boolean {
  const normalized = candidate.replace(/^\.\//, '');
  if (!normalized.endsWith('/')) {
    return false;
  }

  const trimmed = normalized.slice(0, -1);
  if (!trimmed) {
    return false;
  }

  return trimmed.split('/').every((segment) => /^[A-Za-z0-9._-]+$/.test(segment));
}

function isLikelyFilePath(candidate: string): boolean {
  const normalized = candidate.replace(/^\.\//, '');
  const lastSegment = normalized.split('/').pop() ?? normalized;
  const extension = lastSegment.includes('.') ? lastSegment.split('.').pop()?.toLowerCase() ?? '' : '';

  if (KNOWN_DOTFILES.has(lastSegment.toLowerCase())) {
    return true;
  }

  if (ROOT_FILENAME_RE.test(normalized)) {
    return true;
  }

  const hasDirectory = normalized.includes('/');
  if (!hasDirectory) {
    return COMMON_ROOT_FILES.has(normalized.toLowerCase());
  }

  if (!extension || !KNOWN_FILE_EXTENSIONS.has(extension)) {
    return false;
  }

  const basename = lastSegment.slice(0, -(extension.length + 1));
  if (basename.length < 2) {
    return false;
  }

  return true;
}

function buildGitHubUrl(owner: string, repo: string, path: string, branch: string, kind: 'blob' | 'tree'): string {
  const normalizedPath = path.replace(/^\.\//, '');
  const encodedPath = normalizedPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const encodedBranch = encodeURIComponent(branch);

  return `https://github.com/${owner}/${repo}/${kind}/${encodedBranch}/${encodedPath}`;
}

function asRepoLink(
  candidate: string,
  owner: string,
  repo: string,
  branch: string | undefined,
  knownPaths?: RepoTreePaths,
): string | null {
  const punctuationMatch = candidate.match(TRAILING_PUNCTUATION_RE);
  const trailing = punctuationMatch?.[0] ?? '';
  const rawPath = trailing ? candidate.slice(0, -trailing.length) : candidate;
  const normalizedPath = rawPath.replace(/^\.\//, '');
  const effectiveBranch = branch || 'HEAD';
  const hasKnownPaths = !!knownPaths && (knownPaths.directories.size > 0 || knownPaths.files.size > 0);

  if (isLikelyDirectoryPath(normalizedPath)) {
    const normalizedDirPath = normalizedPath.slice(0, -1);
    if (hasKnownPaths && !knownPaths.directories.has(normalizedDirPath)) {
      return null;
    }
    return `[${rawPath}](${buildGitHubUrl(owner, repo, normalizedDirPath, effectiveBranch, 'tree')})${trailing}`;
  }

  if (!isLikelyFilePath(normalizedPath)) {
    return null;
  }

  if (hasKnownPaths && !knownPaths.files.has(normalizedPath)) {
    return null;
  }

  return `[${rawPath}](${buildGitHubUrl(owner, repo, normalizedPath, effectiveBranch, 'blob')})${trailing}`;
}

function linkifyPlainTextSegment(
  text: string,
  owner: string,
  repo: string,
  branch: string | undefined,
  knownPaths?: RepoTreePaths,
): string {
  return text.replace(PATH_CANDIDATE_RE, (match, _candidate: string, offset: number, fullText: string) => {
    const before = fullText.slice(0, offset);
    const openBracket = before.lastIndexOf('[');
    const closeBracket = before.lastIndexOf(']');
    const openParen = before.lastIndexOf('(');
    const closeParen = before.lastIndexOf(')');

    const insideMarkdownLinkLabel = openBracket > closeBracket;
    const insideMarkdownLinkTarget = openParen > closeParen && closeBracket > openParen;
    if (insideMarkdownLinkLabel || insideMarkdownLinkTarget) {
      return match;
    }

    return asRepoLink(match, owner, repo, branch, knownPaths) ?? match;
  });
}

export function linkifyRepoPaths(content: string, owner?: string, repo?: string, branch?: string): string {
  if (!owner || !repo) {
    return content;
  }

  const knownPaths = extractRepoTreePaths(content);

  return content
    .split(FENCED_CODE_BLOCK_RE)
    .map((block) => {
      if (block.startsWith('```')) {
        return block;
      }

      return block
        .split(INLINE_CODE_RE)
        .map((segment) => {
          if (!segment.startsWith('`')) {
            return linkifyPlainTextSegment(segment, owner, repo, branch, knownPaths);
          }

          const inlineCodeValue = segment.slice(1, -1).trim();
          return asRepoLink(inlineCodeValue, owner, repo, branch, knownPaths) ?? segment;
        })
        .join('');
    })
    .join('');
}
