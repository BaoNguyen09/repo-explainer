import { useRef } from 'react';
import { LoadingSpinner } from '../LoadingSpinner';
import { RepoWorkspace } from '../RepoWorkspace';
import { useExplainFlow } from '../../hooks/useExplainFlow';
import { useAutoSubmitFromPath } from '../../hooks/useAutoSubmitFromPath';
import { parseGitHubUrl } from '../../utils/parseGitHubUrl';
import './InputForm.css';

export function InputForm() {
  const {
    isLoading,
    resultData,
    isStoredOverview,
    error,
    statusMessage,
    completedSteps,
    parsedRepo,
    notifyEnabled,
    notifySupported,
    submit,
    regenerate,
    enableNotifications,
  } = useExplainFlow();
  const inputRef = useRef<HTMLInputElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // When URL path is /owner/repo (e.g. from extension), prefill form and auto-submit once
  useAutoSubmitFromPath(submit, (query, instructions) => {
    if (inputRef.current) inputRef.current.value = query;
    if (instructions && instructionsRef.current) instructionsRef.current.value = instructions;
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = formData.get('query') as string;
    const instructions = formData.get('instructions') as string;
    submit(query, instructions);
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
        <LoadingSpinner
          message={statusMessage}
          completedSteps={completedSteps}
          notifySupported={notifySupported}
          notifyEnabled={notifyEnabled}
          onEnableNotifications={enableNotifications}
        />
      )}

      {!isLoading && resultData && parsedRepo && (
        <RepoWorkspace
          data={resultData}
          owner={parsedRepo.owner}
          repo={parsedRepo.repo}
          isStoredOverview={isStoredOverview}
          onRegenerate={regenerate}
        />
      )}
    </div>
  );
}

