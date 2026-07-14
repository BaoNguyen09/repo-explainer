import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 640px)';

function getMatch(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** True when the viewport is at or below the app's existing 640px mobile breakpoint. */
export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(getMatch);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
