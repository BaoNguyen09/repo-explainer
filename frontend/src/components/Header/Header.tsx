import './Header.css';
import githubIcon from '../../assets/github.svg';

type Theme = 'light' | 'dark';

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export function Header({ theme, onToggleTheme }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-content">
        <a href="/" className="logo-link">
          <img src="/logo.png" alt="Repo Explainer" className="logo-img" />
          <div className="logo">
            <span className="logo-part">Repo</span>
            <span className="logo-part-accent">Explainer</span>
          </div>
        </a>
        <nav className="header-nav">
          <button
            type="button"
            className="theme-toggle"
            onClick={onToggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <a href="https://github.com/BaoNguyen09/repo-explainer" className="nav-link">
            <img className="nav-icon" src={githubIcon} alt="" />
            GitHub
          </a>
        </nav>
      </div>
      <div className="header-divider"></div>
    </header>
  );
}


