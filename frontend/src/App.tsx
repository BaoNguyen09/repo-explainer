import { useEffect, useState } from 'react';
import './App.css';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { InputForm } from './components/InputForm';
import { MobileApp } from './components/MobileApp';
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

  // Mobile gets its own screen-based flow instead of the desktop's single scrolling
  // page — rendered as a distinct tree, not just CSS, so only one of the two ever
  // opens the SSE/WebSocket connections at a time.
  if (isMobile) {
    return <MobileApp theme={theme} onToggleTheme={toggleTheme} />;
  }

  return (
    <div className="app">
      <Header theme={theme} onToggleTheme={toggleTheme} />
      <main className="main-content">
        <div className="hero-section">
          <h1 className="main-title">
            <span className="sparkle sparkle-left">✨</span>
            <span className="title-text">Understand any repository</span>
            <span className="sparkle sparkle-right">✨</span>
          </h1>
          <div className="description">
            <p>Get AI explanations of any GitHub repository.</p>
          </div>
        </div>
        <InputForm />
      </main>
      <Footer />
    </div>
  );
}

export default App;
