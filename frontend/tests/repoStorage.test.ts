import { beforeEach, describe, expect, test } from 'bun:test';

import { loadStoredRepoState, saveRepoOverview } from '../src/utils/repoStorage';

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
});
