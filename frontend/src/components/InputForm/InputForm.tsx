import { useState, useRef } from 'react';
import { parseGitHubUrl } from '../../utils/parseGitHubUrl';
import type { FormResult } from '../../types';
import { LoadingSpinner } from '../LoadingSpinner';
import { ResultDisplay } from '../ResultDisplay';
import './InputForm.css';

export function InputForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [resultData, setResultData] = useState<FormResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setResultData(null);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      const query = formData.get("query") as string;
      
      if (!query || !query.trim()) {
        throw new Error('Please enter a GitHub repository URL');
      }

      // Parse the URL to extract owner and repo
      const parsed = parseGitHubUrl(query);
      if (!parsed) {
        throw new Error('Invalid GitHub URL format. Please use: https://github.com/owner/repo or owner/repo');
      }

      console.log(`Fetching explanation for: ${parsed.owner}/${parsed.repo}`);
      
      const response = await fetch(`http://127.0.0.1:8000/${parsed.owner}/${parsed.repo}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Network response was not ok' }));
        throw new Error(errorData.detail || `Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setResultData(data);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred while fetching the explanation';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  const handleTryExample = (repo: string) => {
    if (inputRef.current) {
      inputRef.current.value = repo;
      inputRef.current.focus();
    }
  };

  const exampleRepos = [
    { url: 'github.com/baonguyen09/repo-explainer', label: 'RepoExplainer'},
    { url: 'github.com/fastapi/fastapi', label: 'FastAPI' },
    { url: 'github.com/streamlit/streamlit', label: 'Streamlit' },
    { url: 'github.com/tom-doerr/api-analytics', label: 'api-analytics' },
    { url: 'github.com/monkeytypegame/monkeytype', label: 'Monkeytype' }
  ];

  return (
    <div className="form-container">
      <form onSubmit={handleSubmit}>
        <div className="input-wrapper">
          <input 
            ref={inputRef}
            name='query' 
            placeholder='https://github.com/username/repo' 
            disabled={isLoading}
            required
          />
          <button 
            type="submit"
            className="generate-btn"
            disabled={isLoading}
            title="Explain"
          >
            Explain
          </button>
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
      </div>

      {error && (
        <div className="error-message">
          <p>Error: {error}</p>
        </div>
      )}

      {isLoading && <LoadingSpinner />}
      
      {!isLoading && resultData && <ResultDisplay data={resultData} />}
    </div>
  );
}

