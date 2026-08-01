import { beforeEach, describe, expect, test } from 'bun:test';

import {
  formatCreatedLabel,
  listRecentRepos,
  loadStoredRepoState,
  saveRepoOverview,
  saveStoredRepoState,
} from '../src/utils/repoStorage';

const storage = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    get length() {
      return storage.size;
    },
    clear() {
      storage.clear();
    },
    getItem(key: string) {
      return storage.has(key) ? storage.get(key)! : null;
    },
    key(index: number) {
      return Array.from(storage.keys())[index] ?? null;
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
  },
  configurable: true,
});

describe('repoStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('stores and restores default branch with cached overview', () => {
    saveRepoOverview(
      {
        explanation: 'Redis overview',
        repo: 'redis/redis',
        timestamp: '2026-04-12T12:00:00.000Z',
        cache: false,
        default_branch: 'unstable',
      },
      'normal',
    );

    const stored = loadStoredRepoState('redis', 'redis');

    expect(stored).not.toBeNull();
    expect(stored?.defaultBranch).toBe('unstable');
    expect(stored?.explanation).toBe('Redis overview');
  });

  test('lists recent repos newest first', () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
    saveStoredRepoState({
      version: 2,
      repo: 'redis/redis',
      explanation: 'older',
      defaultBranch: 'main',
      messages: [],
      style: 'caveman',
      updatedAt: daysAgo(4),
    });
    saveStoredRepoState({
      version: 2,
      repo: 'fastapi/fastapi',
      explanation: 'newer',
      defaultBranch: 'main',
      messages: [],
      style: 'caveman',
      updatedAt: daysAgo(2),
    });

    const recent = listRecentRepos();

    expect(recent.map((r) => r.repo)).toEqual(['fastapi/fastapi', 'redis/redis']);
  });

  test('formats created label relative to now', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatCreatedLabel(threeDaysAgo)).toBe('created 3d ago');
    expect(formatCreatedLabel(new Date().toISOString())).toBe('created today');
  });
});
