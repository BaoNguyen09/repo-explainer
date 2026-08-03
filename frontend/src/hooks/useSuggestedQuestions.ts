import { useEffect, useState } from 'react';
import { config } from '../config/api';
import { loadStoredRepoState, saveSuggestedQuestions } from '../utils/repoStorage';

const DEFAULT_SUGGESTIONS = ['How does routing work?', 'Where is auth handled?', 'Explain the test setup'];

async function fetchSuggestedQuestions(owner: string, repo: string, explanation: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${config.apiUrl}/${owner}/${repo}/suggested-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ explanation }),
    });
    if (!res.ok) return null;
    const data: { questions?: string[] } = await res.json();
    return data?.questions?.length ? data.questions.slice(0, 3) : null;
  } catch {
    return null;
  }
}

/**
 * Fires the suggested-questions request right after a fresh explanation
 * finishes, instead of waiting for the user to open chat. Best-effort: on
 * success the result lands in the repo's cache, so by the time chat opens
 * `useSuggestedQuestions` below finds it already there and skips its own
 * fetch. Failures are silently ignored — chat still has its own fallback.
 */
export function prefetchSuggestedQuestions(owner: string, repo: string, explanation: string): void {
  fetchSuggestedQuestions(owner, repo, explanation).then((questions) => {
    if (questions) saveSuggestedQuestions(owner, repo, questions);
  });
}

/**
 * Repo-specific follow-up questions for the chat composer. Every mount
 * checks the repo's cache entry directly — not just `preloaded` — because
 * closing and reopening chat within the same session remounts this hook
 * with the same (possibly stale) `preloaded` prop from the parent's
 * original result; the cache is the one place a fetch's outcome actually
 * gets persisted (including `prefetchSuggestedQuestions` above, which
 * usually already has an answer waiting by the time chat opens). Only
 * fetches from the backend when neither source has an answer yet, and
 * persists that result so it's never asked again until the overview is
 * regenerated.
 */
export function useSuggestedQuestions(
  owner: string,
  repo: string,
  explanation: string,
  preloaded?: string[],
): string[] {
  const known = () => {
    if (preloaded && preloaded.length > 0) return preloaded;
    const stored = loadStoredRepoState(owner, repo)?.suggestedQuestions;
    return stored && stored.length > 0 ? stored : undefined;
  };

  const [suggestions, setSuggestions] = useState<string[]>(() => known() ?? DEFAULT_SUGGESTIONS);

  useEffect(() => {
    const existing = known();
    if (existing) {
      setSuggestions(existing);
      return;
    }

    let cancelled = false;

    fetchSuggestedQuestions(owner, repo, explanation).then((questions) => {
      if (cancelled || !questions) return;
      setSuggestions(questions);
      saveSuggestedQuestions(owner, repo, questions);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `known` reads owner/repo/preloaded already listed below; re-deriving it isn't a stable dep.
  }, [owner, repo, explanation, preloaded]);

  return suggestions;
}
