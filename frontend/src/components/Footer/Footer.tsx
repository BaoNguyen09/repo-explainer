import './Footer.css';
import { track } from '../../config/analytics';

// Set at build time by CI (e.g. GitHub Actions: VITE_GIT_SHA: ${{ github.sha }}). Not imported from any module.
const buildSha = import.meta.env.VITE_GIT_SHA as string | undefined;
// Semantic version, also set by CI: MAJOR.MINOR from frontend/VERSION, patch auto-bumped per merge.
const appVersion = import.meta.env.VITE_APP_VERSION as string | undefined;

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
        {(appVersion || buildSha) && (
          <p className="footer-build-id" title={buildSha ? `Build ${buildSha.slice(0, 7)}` : undefined}>
            {appVersion ? `v${appVersion}` : `Build: ${buildSha!.slice(0, 7)}`}
          </p>
        )}
      </div>
    </footer>
  );
}
