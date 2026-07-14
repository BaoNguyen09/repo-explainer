import { useRef, useState } from 'react';
import githubIcon from '../../assets/github.svg';
import './DesktopHome.css';

type Theme = 'light' | 'dark';

interface ExampleRepo {
  label: string;
  url: string;
}

const EXAMPLE_REPOS: ExampleRepo[] = [
  { label: 'RepoExplainer', url: 'https://github.com/baonguyen09/repo-explainer' },
  { label: 'FastAPI', url: 'https://github.com/fastapi/fastapi' },
  { label: 'OpenClaw', url: 'https://github.com/openclaw/openclaw' },
  { label: 'Redis', url: 'https://github.com/redis/redis' },
  { label: 'Ollama', url: 'https://github.com/ollama/ollama' },
];

const PRODUCT_HUNT_URL =
  'https://www.producthunt.com/products/repo-explainer?utm_source=badge-follow&utm_medium=badge&utm_campaign=badge-repo-explainer';

// Set at build time by CI, same as the old Footer.
const buildSha = import.meta.env.VITE_GIT_SHA as string | undefined;
const appVersion = import.meta.env.VITE_APP_VERSION as string | undefined;

interface DesktopHomeProps {
  theme: Theme;
  onToggleTheme: () => void;
  error: string | null;
  defaultQuery?: string;
  onSubmit: (query: string, instructions: string) => void;
}

export function DesktopHome({ theme, onToggleTheme, error, defaultQuery, onSubmit }: DesktopHomeProps) {
  const [showInstructions, setShowInstructions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);

  const badgeTheme = theme === 'dark' ? 'neutral' : 'light';
  const badgeSrc = `https://api.producthunt.com/widgets/embed-image/v1/follow.svg?product_id=1164116&theme=${badgeTheme}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(inputRef.current?.value ?? '', instructionsRef.current?.value ?? '');
  };

  const pickExample = (url: string) => {
    if (inputRef.current) {
      inputRef.current.value = url;
      inputRef.current.focus();
    }
  };

  return (
    <div className="dh-screen">
      <div className="dh-header">
        <div className="dh-header-row">
          <a href="/" className="dh-logo-link">
            <img src="/logo.png" alt="" className="dh-logo-img" />
            <span className="dh-logo-text">
              <span className="dh-logo-repo">Repo</span>
              <span className="dh-logo-explainer">Explainer</span>
            </span>
          </a>
          <div className="dh-header-actions">
            <a
              href={PRODUCT_HUNT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="dh-ph-badge"
              aria-label="Repo Explainer on Product Hunt"
            >
              <img src={badgeSrc} alt="Repo Explainer on Product Hunt" width={200} height={43} />
            </a>
            <button
              type="button"
              className="dh-icon-btn"
              onClick={onToggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              title={theme === 'light' ? 'Dark mode' : 'Light mode'}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <a
              href="https://github.com/BaoNguyen09/repo-explainer"
              target="_blank"
              rel="noopener noreferrer"
              className="dh-icon-btn"
              title="View source on GitHub"
            >
              <img src={githubIcon} alt="GitHub" className="dh-github-icon" />
            </a>
          </div>
        </div>
        <div className="dh-header-divider" />
      </div>

      <div className="dh-body">
        <div className="dh-card">
          <h1 className="dh-title">
            Understand any repository <span className="dh-sparkle">✨</span>
          </h1>
          <p className="dh-subtitle">
            Get AI explanations of any GitHub repository quickly.
            <br />
            This is useful for high-level understanding of any codebase.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="dh-input-row">
              <input
                ref={inputRef}
                defaultValue={defaultQuery}
                placeholder="github.com/username/repo"
                className="dh-input"
                autoComplete="off"
              />
              <button type="submit" className="dh-submit-btn">
                Explain →
              </button>
            </div>

            {showInstructions && (
              <textarea
                ref={instructionsRef}
                rows={2}
                placeholder="e.g. Focus on API design, explain the auth flow…"
                className="dh-instructions"
              />
            )}
            <div className="dh-instructions-toggle-row">
              <button
                type="button"
                className="dh-instructions-toggle"
                onClick={() => setShowInstructions((v) => !v)}
              >
                {showInstructions ? '− Hide instructions' : '+ Ask something specific'}
              </button>
            </div>
          </form>

          {error && <p className="dh-error">{error}</p>}

          <div className="dh-examples">
            <p className="dh-examples-label">Try an example</p>
            <div className="dh-examples-chips">
              {EXAMPLE_REPOS.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  className="dh-chip"
                  onClick={() => pickExample(ex.url)}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="dh-footer">
        <div className="dh-footer-divider" />
        <div className="dh-footer-content">
          <p>
            Feedback?{' '}
            <a href="https://x.com/BaoNguyen0905" target="_blank" rel="noopener noreferrer">
              DM me on X
            </a>{' '}
            or{' '}
            <a href="https://github.com/BaoNguyen09/repo-explainer/issues" target="_blank" rel="noopener noreferrer">
              open an issue
            </a>
          </p>
          <p>
            Made by <strong className="dh-footer-brand">thienbao.dev</strong>
            {(appVersion || buildSha) && (
              <span className="dh-footer-build" title={buildSha ? `Build ${buildSha.slice(0, 7)}` : undefined}>
                {' '}
                ({appVersion ? `v${appVersion}` : `Build: ${buildSha!.slice(0, 7)}`})
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
