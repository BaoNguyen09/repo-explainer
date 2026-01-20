import './Header.css';
import githubIcon from '../../assets/github.svg';

export function Header() {
  return (
    <header className="app-header">
      <div className="header-content">
        <a href="/" className="logo-link">
          <div className="logo">
            <span className="logo-part">Repo</span>
            <span className="logo-part-accent">Explainer</span>
          </div>
        </a>
        <nav className="header-nav">
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


