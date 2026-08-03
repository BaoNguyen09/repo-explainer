import { useEffect, useState } from 'react';
import { config } from '../config/api';
import { loadStoredRepoState, saveSuggestedQuestions } from '../utils/repoStorage';

const DEFAULT_SUGGESTIONS = ['How does routing work?', 'Where is auth handled?', 'Explain the test setup'];

/**
 * Repo-specific follow-up questions for the chat composer. The backend
 * generates these right after the overview finishes and returns them inline
 * on the result (`preloaded`), covering the common case with zero extra
 * latency. Every mount also checks the repo's cache entry directly — not
 * just `preloaded` — because closing and reopening chat within the same
 * session remounts this hook with the same (possibly stale) `preloaded`
 * prop from the parent's original result; the cache is the one place a
 * fallback fetch's outcome actually gets persisted. Only fetches from the
 * backend when neither source has an answer yet, and persists that result
 * so it's never asked again until the overview is regenerated.
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

    fetch(`${config.apiUrl}/${owner}/${repo}/suggested-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ explanation }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { questions?: string[] } | null) => {
        if (!cancelled && data?.questions?.length) {
          const questions = data.questions.slice(0, 3);
          setSuggestions(questions);
          saveSuggestedQuestions(owner, repo, questions);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `known` reads owner/repo/preloaded already listed below; re-deriving it isn't a stable dep.
  }, [owner, repo, explanation, preloaded]);

  return suggestions;
}
