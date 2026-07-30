import { useEffect, useState } from 'react';
import { EXPLAIN_STAGE_ORDER } from '../../hooks/useExplainFlow';
import './MobileLoading.css';

const STEP_LABELS: Record<string, string> = {
  validating: 'Validating repository',
  fetching_tree: 'Fetching directory structure',
  exploring_files: 'AI is exploring which files to read',
  fetching_files: 'Fetching file contents',
  generating_explanation: 'Generating explanation',
};

// Not a real backend stage — represents the gap before the first SSE "status" event
// arrives (which can be tens of seconds on a cold start), surfaced as its own step
// instead of just floating wait-message text.
const CONNECTING_STEP = 'connecting';
const STEPS = [CONNECTING_STEP, ...EXPLAIN_STAGE_ORDER];

interface MobileLoadingProps {
  repoName: string;
  currentStage: string | null;
  notifyEnabled: boolean;
  notifySupported: boolean;
  onEnableNotify: () => void;
  onCancel: () => void;
}

export function MobileLoading({
  repoName,
  currentStage,
  notifyEnabled,
  notifySupported,
  onEnableNotify,
  onCancel,
}: MobileLoadingProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Still connecting (index 0) until the first real SSE stage arrives, then offset by 1.
  const realStageIndex = currentStage
    ? EXPLAIN_STAGE_ORDER.indexOf(currentStage as (typeof EXPLAIN_STAGE_ORDER)[number])
    : -1;
  const currentIndex = realStageIndex === -1 ? 0 : realStageIndex + 1;
  // currentIndex is how many steps are already done; STEPS.length is the total
  // (the screen unmounts before the last one "completes", so this never hits 100%).
  const progressPct = Math.round((currentIndex / STEPS.length) * 100);

  return (
    <div className="ml-screen">
      <div className="ml-progress-track">
        <div className="ml-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="ml-repo-row">
        <img src="/logo.png" alt="" className="ml-logo-img" />
        <span className="ml-repo-label">
          Explaining <strong>{repoName}</strong>
        </span>
      </div>

      <div className="ml-steps">
        {STEPS.map((stage, i) => {
          const label = stage === CONNECTING_STEP ? 'Connecting to server' : STEP_LABELS[stage] ?? stage;
          if (i === currentIndex) {
            return (
              <div key={stage} className="ml-step ml-step-current">
                <span className="ml-step-spinner" />
                <div>
                  <div className="ml-step-title">{label}</div>
                  <div className="ml-step-meta">{elapsed}s elapsed · usually under a minute</div>
                </div>
              </div>
            );
          }
          if (i < currentIndex) {
            return (
              <div key={stage} className="ml-step ml-step-done">
                <span className="ml-step-check">✓</span>
                {label}
              </div>
            );
          }
          return (
            <div key={stage} className="ml-step ml-step-pending">
              <span className="ml-step-dot" />
              {label}
            </div>
          );
        })}
      </div>

      <div className="ml-actions">
        {notifySupported && (
          <button type="button" className="ml-notify-btn" onClick={onEnableNotify}>
            {notifyEnabled ? "✓ We'll notify you when it's ready" : "🔔 Notify me when it's ready"}
          </button>
        )}
        <button type="button" className="ml-cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
