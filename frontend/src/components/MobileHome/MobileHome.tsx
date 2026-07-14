import { useRef, useState } from 'react';
import githubIcon from '../../assets/github.svg';
import './MobileHome.css';

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

// Set at build time by CI, same as the desktop Footer.
const buildSha = import.meta.env.VITE_GIT_SHA as string | undefined;
const appVersion = import.meta.env.VITE_APP_VERSION as string | undefined;

interface MobileHomeProps {
  theme: Theme;
  onToggleTheme: () => void;
  error: string | null;
  defaultQuery?: string;
  onSubmit: (query: string, instructions: string) => void;
}

export function MobileHome({ theme, onToggleTheme, error, defaultQuery, onSubmit }: MobileHomeProps) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);

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
    <div className="mh-screen">
      <div className="mh-header">
        <div className="mh-header-row">
          <a href="/" className="mh-logo-link">
            <img src="/logo.png" alt="" className="mh-logo-img" />
            <span className="mh-logo-text">
              <span className="mh-logo-repo">Repo</span>
              <span className="mh-logo-explainer">Explainer</span>
            </span>
          </a>
          <div className="mh-header-actions">
            <button
              type="button"
              className="mh-icon-btn"
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
              className="mh-icon-btn"
              title="View source on GitHub"
            >
              <img src={githubIcon} alt="GitHub" className="mh-github-icon" />
            </a>
          </div>
        </div>
        <div className="mh-header-divider" />
      </div>

      <div className="mh-body">
        <h1 className="mh-title">
          Understand
          <br />
          any repository
        </h1>
        <p className="mh-subtitle">
          Get AI explanations of any GitHub repository.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mh-input-row">
            <input
              ref={inputRef}
              defaultValue={defaultQuery}
              placeholder="github.com/username/repo"
              className="mh-input"
              autoComplete="off"
            />
            <button type="submit" className="mh-submit-btn" aria-label="Explain repository">
              →
            </button>
          </div>

          {showInstructions && (
            <textarea
              ref={instructionsRef}
              rows={2}
              placeholder="e.g. Focus on API design, explain the auth flow…"
              className="mh-instructions"
            />
          )}
          <button
            type="button"
            className="mh-instructions-toggle"
            onClick={() => setShowInstructions((v) => !v)}
          >
            {showInstructions ? '− Hide instructions' : '+ Ask something specific'}
          </button>
        </form>

        {error && <p className="mh-error">{error}</p>}

        <div className="mh-examples">
          <button
            type="button"
            className="mh-examples-toggle"
            onClick={() => setExamplesOpen((v) => !v)}
          >
            <span className="mh-examples-label">Try an example</span>
            <span className="mh-examples-chevron">{examplesOpen ? '▴' : '▾'}</span>
          </button>
          {examplesOpen && (
            <div className="mh-examples-chips">
              {EXAMPLE_REPOS.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  className="mh-chip"
                  onClick={() => pickExample(ex.url)}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mh-footer">
        <div className="mh-footer-divider" />
        <div className="mh-footer-content">
          <p>
            Made by{' '}
            <a
              href="https://thienbao.dev?referrer=repo-explainer&utm_source=repo-explainer&utm_medium=footer&utm_campaign=referral"
              target="_blank"
              rel="noopener noreferrer"
            >
              thienbao.dev
            </a>
          </p>
          {(appVersion || buildSha) && (
            <p className="mh-footer-build" title={buildSha ? `Build ${buildSha.slice(0, 7)}` : undefined}>
              {appVersion ? `v${appVersion}` : `Build: ${buildSha!.slice(0, 7)}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
