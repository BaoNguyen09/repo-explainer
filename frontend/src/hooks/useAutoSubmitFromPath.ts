import { useEffect, useRef } from 'react';

/**
 * Parse pathname like "/owner/repo" into { owner, repo }.
 * Used when user lands on e.g. repex.thienbao.dev/facebook/react (e.g. from extension).
 * Strips Vite base URL (e.g. / or /repo-explainer/) so it works with any deployment path.
 */
function parsePathRepo(pathname: string): { owner: string; repo: string } | null {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '') || '';
  const pathWithoutBase = base ? pathname.slice(base.length) || '/' : pathname;
  const normalized = pathWithoutBase.startsWith('/') ? pathWithoutBase : `/${pathWithoutBase}`;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length !== 2) return null;
  const [owner, repo] = segments;
  if (!owner || !repo) return null;
  return { owner, repo };
}

/**
 * When the URL path is "/owner/repo", submits that repo once on mount (optionally with an
 * `?instructions=` query param), and reports the resolved query/instructions back so the
 * caller can prefill its own input fields. Shared by desktop and mobile so deep links (e.g.
 * from the browser extension) work the same regardless of viewport.
 */
export function useAutoSubmitFromPath(
  submit: (query: string, instructions: string) => void,
  onResolved?: (query: string, instructions: string) => void,
): void {
  const hasAutoSubmittedRef = useRef(false);

  useEffect(() => {
    if (hasAutoSubmittedRef.current) return;
    const { pathname, search } = window.location;
    const parsed = parsePathRepo(pathname);
    if (!parsed) return;

    hasAutoSubmittedRef.current = true;
    const query = `https://github.com/${parsed.owner}/${parsed.repo}`;
    const instructions = new URLSearchParams(search).get('instructions') ?? '';

    onResolved?.(query, instructions);
    submit(query, instructions);
    // Only ever runs once per mount; submit/onResolved identity changes shouldn't re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
