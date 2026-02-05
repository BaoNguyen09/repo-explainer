import './Footer.css';

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
        {buildSha && (
          <p className="footer-build-id" title="Git commit deployed (for debugging)">
            Build: {buildSha.slice(0, 7)}
          </p>
        )}
      </div>
    </footer>
  );
}


