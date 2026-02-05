import { useState, useRef } from 'react';
import { parseGitHubUrl } from '../../utils/parseGitHubUrl';
import type { FormResult } from '../../types';
import { LoadingSpinner } from '../LoadingSpinner';
import { ResultDisplay } from '../ResultDisplay';
import { config } from '../../config/api';
import './InputForm.css';

export function InputForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [resultData, setResultData] = useState<FormResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);

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

      // Get optional instructions
      const instructions = formData.get("instructions") as string;
      const instructionsTrimmed = instructions?.trim() || "";
      
      // Build URL with optional instructions query parameter
      let url = `${config.apiUrl}/${parsed.owner}/${parsed.repo}`;
      if (instructionsTrimmed) {
        url += `?instructions=${encodeURIComponent(instructionsTrimmed)}`;
      }

      console.log(`Fetching explanation for: ${parsed.owner}/${parsed.repo}`);
      
      const response = await fetch(url);
      
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

  const handleTryExampleInstruction = (instruction: string) => {
    if (instructionsRef.current) {
      instructionsRef.current.value = instruction;
      instructionsRef.current.focus();
    }
  };

  const exampleRepos = [
    { url: 'https://github.com/baonguyen09/repo-explainer', label: 'RepoExplainer'},
    { url: 'https://github.com/fastapi/fastapi', label: 'FastAPI' },
    { url: 'https://github.com/streamlit/streamlit', label: 'Streamlit' },
    { url: 'https://github.com/tom-doerr/api-analytics', label: 'api-analytics' },
    { url: 'https://github.com/monkeytypegame/monkeytype', label: 'Monkeytype' }
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

      {isLoading && <LoadingSpinner />}
      
      {!isLoading && resultData && <ResultDisplay data={resultData} />}
    </div>
  );
}

