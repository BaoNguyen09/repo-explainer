import { useEffect, useState } from 'react';
import { MobileApp } from './components/MobileApp';
import { DesktopApp } from './components/DesktopApp';
import { useIsMobileViewport } from './hooks/useIsMobileViewport';
import { config } from './config/api';

const THEME_STORAGE_KEY = 'repo-explainer-theme';
type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'light';
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const isMobile = useIsMobileViewport();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  // Fire-and-forget warm-up ping: the backend runs on a free tier that sleeps
  // when idle, so a cold start can take 30-60s. Ping it as soon as the app
  // loads so it starts waking up while the user is still typing a repo URL.
  useEffect(() => {
    fetch(`${config.apiUrl}/`).catch(() => {});
  }, []);

  // Mobile and desktop each get their own screen-based flow, rendered as distinct
  // trees (not just CSS), so only one of the two ever opens the SSE/WebSocket
  // connections at a time.
  if (isMobile) {
    return <MobileApp theme={theme} onToggleTheme={toggleTheme} />;
  }

  return <DesktopApp theme={theme} onToggleTheme={toggleTheme} />;
}

export default App;
