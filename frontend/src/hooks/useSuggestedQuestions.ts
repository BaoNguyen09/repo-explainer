import { useEffect, useState } from 'react';
import { config } from '../config/api';

const DEFAULT_SUGGESTIONS = ['How does routing work?', 'Where is auth handled?', 'Explain the test setup'];

/**
 * Fetches 3 repo-specific follow-up questions from the backend, starting
 * from the hard-coded defaults so the composer never renders empty while
 * the request is in flight (or if it fails).
 */
export function useSuggestedQuestions(owner: string, repo: string, explanation: string): string[] {
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);

  useEffect(() => {
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
  }, [owner, repo, explanation]);

  return suggestions;
}
