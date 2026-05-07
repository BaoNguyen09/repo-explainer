import type { ChatMessage, ChatStyle, FormResult, StoredRepoState } from '../types';

const STORAGE_PREFIX = 'repo-explainer:repo:';
const STORAGE_VERSION = 2;
const MAX_STORED_REPOS = 10;
const MAX_REPO_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ChatMessage>;
  return (
    (candidate.role === 'user' || candidate.role === 'assistant' || candidate.role === 'tool') &&
    typeof candidate.content === 'string' &&
    typeof candidate.timestamp === 'string'
  );
}

function parseStoredRepoState(raw: string | null): StoredRepoState | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredRepoState>;
    if (
      parsed.version !== STORAGE_VERSION ||
      typeof parsed.repo !== 'string' ||
      typeof parsed.explanation !== 'string' ||
      typeof parsed.defaultBranch !== 'string' ||
      typeof parsed.updatedAt !== 'string' ||
      (parsed.style !== 'normal' && parsed.style !== 'caveman') ||
      !Array.isArray(parsed.messages)
    ) {
      return null;
    }

    if (!parsed.messages.every(isChatMessage)) {
      return null;
    }

    return {
      version: parsed.version,
      repo: parsed.repo,
      explanation: parsed.explanation,
      defaultBranch: parsed.defaultBranch,
      messages: parsed.messages,
      style: parsed.style,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

function getStorageKey(owner: string, repo: string): string {
  return `${STORAGE_PREFIX}${owner}/${repo}`;
}

function pruneRepoEntries(currentKey?: string): void {
  const now = Date.now();
  const entries: Array<{ key: string; state: StoredRepoState }> = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(STORAGE_PREFIX)) continue;

    const parsed = parseStoredRepoState(localStorage.getItem(key));
    if (!parsed) {
      localStorage.removeItem(key);
      continue;
    }

    const ageMs = now - Date.parse(parsed.updatedAt);
    if (Number.isNaN(ageMs) || ageMs > MAX_REPO_AGE_MS) {
      if (key !== currentKey) {
        localStorage.removeItem(key);
      }
      continue;
    }

    entries.push({ key, state: parsed });
  }

  entries.sort((a, b) => Date.parse(b.state.updatedAt) - Date.parse(a.state.updatedAt));
  const keep = currentKey ? MAX_STORED_REPOS - 1 : MAX_STORED_REPOS;
  const survivors = new Set(entries.slice(0, Math.max(keep, 0)).map((entry) => entry.key));

  for (const entry of entries) {
    if (entry.key === currentKey) continue;
    if (!survivors.has(entry.key)) {
      localStorage.removeItem(entry.key);
    }
  }
}

export function loadStoredRepoState(owner: string, repo: string): StoredRepoState | null {
  return parseStoredRepoState(localStorage.getItem(getStorageKey(owner, repo)));
}

export function saveStoredRepoState(state: StoredRepoState): void {
  const key = `${STORAGE_PREFIX}${state.repo}`;
  pruneRepoEntries(key);
  localStorage.setItem(key, JSON.stringify(state));
}

export function saveRepoOverview(result: FormResult, previousStyle: ChatStyle = 'normal'): void {
  saveStoredRepoState({
    version: STORAGE_VERSION,
    repo: result.repo,
    explanation: result.explanation,
    defaultBranch: result.default_branch,
    messages: [],
    style: previousStyle,
    updatedAt: new Date().toISOString(),
  });
}

export function clearStoredRepoMessages(owner: string, repo: string): void {
  const existing = loadStoredRepoState(owner, repo);
  if (!existing) return;

  saveStoredRepoState({
    ...existing,
    messages: [],
    updatedAt: new Date().toISOString(),
  });
}

export function createUpdatedRepoState(
  owner: string,
  repo: string,
  explanation: string,
  defaultBranch: string,
  messages: ChatMessage[],
  style: ChatStyle,
): StoredRepoState {
  return {
    version: STORAGE_VERSION,
    repo: `${owner}/${repo}`,
    explanation,
    defaultBranch,
    messages,
    style,
    updatedAt: new Date().toISOString(),
  };
}
