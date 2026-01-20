import './LoadingSpinner.css';

export function LoadingSpinner() {
  return (
    <div className="loading-container">
      <div className="spinner"></div>
      <p>Processing the repository... This may take a moment.</p>
    </div>
  );
}


