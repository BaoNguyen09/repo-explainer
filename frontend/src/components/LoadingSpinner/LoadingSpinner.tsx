import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  /** Current step message (e.g. "Fetching directory structure...") */
  message?: string | null;
  /** Optional list of completed step messages for progress display */
  completedSteps?: string[];
}

export function LoadingSpinner({ message, completedSteps = [] }: LoadingSpinnerProps) {
  return (
    <div className="loading-container">
      <div className="spinner"></div>
      {message && <p className="loading-message">{message}</p>}
      {!message && <p>Connecting...</p>}
      {completedSteps.length > 0 && (
        <ul className="loading-steps">
          {completedSteps.map((step, i) => (
            <li key={i} className="loading-step-done">
              {step}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


