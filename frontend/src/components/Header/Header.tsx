import './Header.css';
import githubIcon from '../../assets/github.svg';

const PRODUCT_HUNT_URL =
  'https://www.producthunt.com/products/repo-explainer?utm_source=badge-follow&utm_medium=badge&utm_campaign=badge-repo-explainer';

type Theme = 'light' | 'dark';

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export function Header({ theme, onToggleTheme }: HeaderProps) {
  const badgeTheme = theme === 'dark' ? 'neutral' : 'light';
  const badgeSrc = `https://api.producthunt.com/widgets/embed-image/v1/follow.svg?product_id=1164116&theme=${badgeTheme}`;

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
          <a
            href={PRODUCT_HUNT_URL}
            className="header-ph-badge"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Repo Explainer on Product Hunt"
          >
            <img src={badgeSrc} alt="Repo Explainer - Get explanation of any GitHub codebase in &lt;1m | Product Hunt" width={250} height={54} />
          </a>
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


