import { useState, useRef, useEffect } from 'react';
import { parseGitHubUrl } from '../../utils/parseGitHubUrl';
import type { FormResult } from '../../types';
import { LoadingSpinner } from '../LoadingSpinner';
import { ResultDisplay } from '../ResultDisplay';
import { config } from '../../config/api';
import './InputForm.css';

/**
 * Parse pathname like "/owner/repo" into { owner, repo }.
 * Used when user lands on e.g. repex.thienbao.dev/facebook/react (e.g. from extension).
 * Strips Vite base URL (e.g. / or /repo-explainer/) so it works with any deployment path.
 */
function parsePathRepo(pathname: string): { owner: string; repo: string } | null {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '') || '';
  const pathWithoutBase = base ? pathname.slice(base.length) || '/' : pathname;
  const normalized = pathWithoutBase.startsWith('/') ? pathWithoutBase : `/${pathWithoutBase}`;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length !== 2) return null;
  const [owner, repo] = segments;
  if (!owner || !repo) return null;
  return { owner, repo };
}

const STAGE_MESSAGES: Record<string, string> = {
  validating: 'Validating repository...',
  fetching_tree: 'Fetching directory structure...',
  exploring_files: 'AI is exploring which files to read...',
  fetching_files: 'Fetching file contents...',
  generating_explanation: 'Generating explanation...',
};

function getMessageForStage(stage: string): string {
  return STAGE_MESSAGES[stage] ?? stage;
}

export function InputForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [resultData, setResultData] = useState<FormResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const hasAutoSubmittedRef = useRef(false);
  const gotResultRef = useRef(false);

  // When URL path is /owner/repo (e.g. from extension), prefill form and auto-submit once
  useEffect(() => {
    if (hasAutoSubmittedRef.current) return;
    const { pathname, search } = window.location;
    const parsed = parsePathRepo(pathname);
    if (!parsed || !inputRef.current || !formRef.current) return;

    hasAutoSubmittedRef.current = true;
    inputRef.current.value = `https://github.com/${parsed.owner}/${parsed.repo}`;

    const params = new URLSearchParams(search);
    const instructions = params.get('instructions');
    if (instructions && instructionsRef.current) {
      instructionsRef.current.value = instructions;
    }

    formRef.current.requestSubmit();
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setResultData(null);
    setError(null);
    setStatusMessage(null);
    setCompletedSteps([]);
    gotResultRef.current = false;

    const formData = new FormData(e.currentTarget);
    const query = formData.get('query') as string;
    if (!query || !query.trim()) {
      setError('Please enter a GitHub repository URL');
      setIsLoading(false);
      return;
    }

    const parsed = parseGitHubUrl(query);
    if (!parsed) {
      setError('Invalid GitHub URL format. Please use: https://github.com/owner/repo or owner/repo');
      setIsLoading(false);
      return;
    }

    const instructions = formData.get('instructions') as string;
    const instructionsTrimmed = instructions?.trim() || '';
    let url = `${config.apiUrl}/${parsed.owner}/${parsed.repo}/stream`;
    if (instructionsTrimmed) {
      url += `?instructions=${encodeURIComponent(instructionsTrimmed)}`;
    }

    const es = new EventSource(url);

    es.addEventListener('status', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { stage?: string };
        const stage = data?.stage;
        if (stage) {
          const msg = getMessageForStage(stage);
          setCompletedSteps((prev) =>
            prev[prev.length - 1] === msg ? prev : [...prev, msg]
          );
          setStatusMessage(msg);
        }
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener('result', (event: MessageEvent) => {
      gotResultRef.current = true;
      try {
        const data = JSON.parse(event.data as string) as FormResult;
        setResultData(data);
      } catch {
        setError('Invalid response from server');
      }
      es.close();
      setIsLoading(false);
      setStatusMessage(null);
      setCompletedSteps([]);
    });

    es.addEventListener('error', (event: MessageEvent) => {
      try {
        if (event.data) {
          const data = JSON.parse(event.data as string) as { detail?: string };
          if (data?.detail) {
            setError(data.detail);
          }
        }
      } catch {
        setError('Connection lost or server error');
      }
      es.close();
      setIsLoading(false);
      setStatusMessage(null);
      setCompletedSteps([]);
    });

    es.onerror = () => {
      if (!gotResultRef.current) {
        setError((prev) => prev || 'Connection lost or server error');
      }
      es.close();
      setIsLoading(false);
      setStatusMessage(null);
      setCompletedSteps([]);
    };
  }

  const handleTryExample = (repo: string) => {
    if (inputRef.current) {
      inputRef.current.value = repo;
      inputRef.current.focus();
    }
  };

  const handleTryExampleInstruction = (instruction: string) => {
    if (instructionsRef.current) {
      instructionsRef.current.value = instruction;
      instructionsRef.current.focus();
    }
  };

  const handleOpenRepoInNewTab = () => {
    const value = inputRef.current?.value?.trim();
    if (!value) return;
    const parsed = parseGitHubUrl(value);
    if (parsed) {
      window.open(`https://github.com/${parsed.owner}/${parsed.repo}`, '_blank', 'noopener,noreferrer');
    }
  };

  const exampleRepos = [
    { url: 'https://github.com/baonguyen09/repo-explainer', label: 'RepoExplainer'},
    { url: 'https://github.com/fastapi/fastapi', label: 'FastAPI' },
    { url: 'https://github.com/openclaw/openclaw', label: 'OpenClaw' },
    { url: 'https://github.com/redis/redis', label: 'Redis' },
    { url: 'https://github.com/ollama/ollama', label: 'Ollama' }
  ];

  const exampleInstructions = [
    { text: 'Focus on API design', label: 'API design' },
    { text: 'Explain the authentication flow', label: 'Auth flow' },
    { text: 'How does the data flow between components?', label: 'Data flow' },
    { text: 'What is the tech stack?', label: 'Tech stack' },
    { text: 'Summarize setup and run instructions', label: 'Setup & run' }
  ];

  return (
    <div className="form-container">
      <form ref={formRef} onSubmit={handleSubmit}>
        <div className="input-wrapper">
          <div className="url-input-wrapper">
            <input 
              ref={inputRef}
              name='query' 
              placeholder='https://github.com/username/repo' 
              disabled={isLoading}
              required
            />
            <button
              type="button"
              className="open-repo-btn"
              onClick={handleOpenRepoInNewTab}
              disabled={isLoading}
              title="Open repo on GitHub"
              aria-label="Open repo on GitHub"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          </div>
          <button 
            type="submit"
            className="generate-btn"
            disabled={isLoading}
            title="Explain"
          >
            Explain
          </button>
        </div>
        <div className="instructions-wrapper">
          <textarea
            ref={instructionsRef}
            name="instructions"
            placeholder="Questions or instructions (optional) - leave blank for a general overview"
            disabled={isLoading}
            rows={1}
            className="instructions-input"
          />
        </div>
      </form>

      <div className="examples-section">
        <p className="examples-label">Try these example repositories:</p>
        <div className="example-buttons">
          {exampleRepos.map((repo) => (
            <button
              key={repo.url}
              type="button"
              className="example-btn"
              onClick={() => handleTryExample(repo.url)}
              disabled={isLoading}
            >
              {repo.label}
            </button>
          ))}
        </div>
        <p className="examples-label examples-label-instructions">Example instructions:</p>
        <div className="example-buttons">
          {exampleInstructions.map((ex) => (
            <button
              key={ex.label}
              type="button"
              className="example-btn"
              onClick={() => handleTryExampleInstruction(ex.text)}
              disabled={isLoading}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>Error: {error}</p>
        </div>
      )}

      {isLoading && (
        <LoadingSpinner message={statusMessage} completedSteps={completedSteps} />
      )}
      
      {!isLoading && resultData && <ResultDisplay data={resultData} />}
    </div>
  );
}

