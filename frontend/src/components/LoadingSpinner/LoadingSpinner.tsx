import { useEffect, useState } from 'react';
import { getWaitMessage } from '../../utils/waitMessage';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  /** Current step message (e.g. "Fetching directory structure...") */
  message?: string | null;
  /** Optional list of completed step messages for progress display */
  completedSteps?: string[];
  /** Show the "Notify me when ready" control (hidden if unsupported or already denied) */
  notifySupported?: boolean;
  /** Whether the user already opted into notifications this session */
  notifyEnabled?: boolean;
  /** Called when the user clicks "Notify me when ready" */
  onEnableNotifications?: () => void;
}

export function LoadingSpinner({
  message,
  completedSteps = [],
  notifySupported = false,
  notifyEnabled = false,
  onEnableNotifications,
}: LoadingSpinnerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Tick a visible elapsed-seconds counter so the UI never looks frozen,
  // and escalate the wait message before the first real SSE stage arrives.
  useEffect(() => {
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const displayMessage = message || getWaitMessage(elapsedSeconds);

  return (
    <div className="loading-container">
      <div className="spinner"></div>
      <p className="loading-message">
        {displayMessage}
        <span className="loading-elapsed"> ({elapsedSeconds}s)</span>
      </p>
      {completedSteps.length > 0 && (
        <ul className="loading-steps">
          {completedSteps.map((step, i) => (
            <li key={i} className="loading-step-done">
              {step}
            </li>
          ))}
        </ul>
      )}
      {notifySupported && !notifyEnabled && (
        <button type="button" className="notify-btn" onClick={onEnableNotifications}>
          🔔 Notify me when ready
        </button>
      )}
      {notifyEnabled && <p className="notify-enabled-hint">We&apos;ll notify you when it&apos;s ready.</p>}
    </div>
  );
}
