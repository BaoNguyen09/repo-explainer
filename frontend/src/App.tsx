import { useEffect, useState } from 'react';
import './App.css';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { InputForm } from './components/InputForm';

const THEME_STORAGE_KEY = 'repo-explainer-theme';
type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'light';
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

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
            <p>Get AI explanations of any GitHub repository quickly.</p>
            <p>This is useful for high-level understanding of any codebase.</p>
          </div>
        </div>
        <InputForm />
      </main>
      <Footer />
    </div>
  );
}

export default App;
