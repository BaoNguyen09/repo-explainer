import { useEffect, useState } from 'react';
import { config } from '../config/api';

const DEFAULT_SUGGESTIONS = ['How does routing work?', 'Where is auth handled?', 'Explain the test setup'];

/**
 * Repo-specific follow-up questions for the chat composer. The backend now
 * generates these right after the overview finishes and returns them inline
 * on the result, so `preloaded` covers the common case with zero extra
 * latency. This only falls back to fetching on mount when `preloaded` is
 * empty — e.g. an overview loaded from the localStorage cache, which
 * predates this field or was never asked for questions.
 */
export function useSuggestedQuestions(
  owner: string,
  repo: string,
  explanation: string,
  preloaded?: string[],
): string[] {
  const hasPreloaded = Boolean(preloaded && preloaded.length > 0);
  const [suggestions, setSuggestions] = useState<string[]>(() =>
    hasPreloaded ? (preloaded as string[]) : DEFAULT_SUGGESTIONS,
  );

  useEffect(() => {
    if (hasPreloaded) return;
    let cancelled = false;

    fetch(`${config.apiUrl}/${owner}/${repo}/suggested-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ explanation }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { questions?: string[] } | null) => {
        if (!cancelled && data?.questions?.length) {
          setSuggestions(data.questions.slice(0, 3));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [owner, repo, explanation, hasPreloaded]);

  return suggestions;
}
