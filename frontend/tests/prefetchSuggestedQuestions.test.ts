import { afterEach, beforeEach, expect, mock, test } from 'bun:test';

import { prefetchSuggestedQuestions } from '../src/hooks/useSuggestedQuestions';
import { loadStoredRepoState, saveRepoOverview } from '../src/utils/repoStorage';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('prefetching right after a fresh explanation caches the questions before chat is ever opened', async () => {
  saveRepoOverview({
    explanation: 'FastAPI overview',
    repo: 'fastapi/fastapi',
    timestamp: '2026-04-12T12:00:00.000Z',
    cache: false,
    default_branch: 'master',
  });

  globalThis.fetch = mock(async () =>
    new Response(JSON.stringify({ questions: ['Where does routing start?'] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch;

  prefetchSuggestedQuestions('fastapi', 'fastapi', 'FastAPI overview');

  // Fire-and-forget: give the microtask queue a turn to resolve the fetch + persist.
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(loadStoredRepoState('fastapi', 'fastapi')?.suggestedQuestions).toEqual([
    'Where does routing start?',
  ]);
});

test('a failed prefetch leaves no partial cache entry behind', async () => {
  saveRepoOverview({
    explanation: 'FastAPI overview',
    repo: 'fastapi/fastapi',
    timestamp: '2026-04-12T12:00:00.000Z',
    cache: false,
    default_branch: 'master',
  });

  globalThis.fetch = mock(async () => new Response('', { status: 500 })) as unknown as typeof fetch;

  prefetchSuggestedQuestions('fastapi', 'fastapi', 'FastAPI overview');
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(loadStoredRepoState('fastapi', 'fastapi')?.suggestedQuestions).toBeUndefined();
});
