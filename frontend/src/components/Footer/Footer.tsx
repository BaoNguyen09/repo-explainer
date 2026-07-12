import './Footer.css';
import { track } from '../../config/analytics';

// Set at build time by CI (e.g. GitHub Actions: VITE_GIT_SHA: ${{ github.sha }}). Not imported from any module.
const buildSha = import.meta.env.VITE_GIT_SHA as string | undefined;

export function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-divider"></div>
      <div className="footer-content">
        <p>
          Made by <a href="https://thienbao.dev?referrer=repo-explainer&utm_source=repo-explainer&utm_medium=footer&utm_campaign=referral" className="footer-link" target="_blank" rel="noopener noreferrer">thienbao.dev</a>
        </p>
        <p>
          Feedback? <a href="https://x.com/BaoNguyen0905" className="footer-link" target="_blank" rel="noopener noreferrer" onClick={() => track('feedback_clicked', { channel: 'x' })}>DM me on X</a>
          {' or '}
          <a href="https://github.com/BaoNguyen09/repo-explainer/issues/new" className="footer-link" target="_blank" rel="noopener noreferrer" onClick={() => track('feedback_clicked', { channel: 'github' })}>open an issue</a>
        </p>
        {buildSha && (
          <p className="footer-build-id" title="Git commit deployed (for debugging)">
            Build: {buildSha.slice(0, 7)}
          </p>
        )}
      </div>
    </footer>
  );
}


