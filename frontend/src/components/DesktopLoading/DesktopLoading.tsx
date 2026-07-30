import { useEffect, useState } from 'react';
import { EXPLAIN_STAGE_ORDER } from '../../hooks/useExplainFlow';
import './DesktopLoading.css';

const STEP_LABELS: Record<string, string> = {
  validating: 'Validating repository',
  fetching_tree: 'Fetching directory structure',
  exploring_files: 'AI is exploring which files to read',
  fetching_files: 'Fetching file contents',
  generating_explanation: 'Generating explanation',
};

const CONNECTING_STEP = 'connecting';
const STEPS = [CONNECTING_STEP, ...EXPLAIN_STAGE_ORDER];

interface DesktopLoadingProps {
  repoName: string;
  currentStage: string | null;
  notifyEnabled: boolean;
  notifySupported: boolean;
  onEnableNotify: () => void;
  onCancel: () => void;
}

export function DesktopLoading({
  repoName,
  currentStage,
  notifyEnabled,
  notifySupported,
  onEnableNotify,
  onCancel,
}: DesktopLoadingProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const realStageIndex = currentStage
    ? EXPLAIN_STAGE_ORDER.indexOf(currentStage as (typeof EXPLAIN_STAGE_ORDER)[number])
    : -1;
  const currentIndex = realStageIndex === -1 ? 0 : realStageIndex + 1;
  // currentIndex is how many steps are already done; STEPS.length is the total
  // (the screen unmounts before the last one "completes", so this never hits 100%).
  const progressPct = Math.round((currentIndex / STEPS.length) * 100);

  return (
    <div className="dl-screen">
      <div className="dl-progress-track">
        <div className="dl-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="dl-repo-row">
        <img src="/logo.png" alt="" className="dl-logo-img" />
        <span className="dl-repo-label">
          Explaining <strong>{repoName}</strong>
        </span>
      </div>

      <div className="dl-center">
        <div className="dl-steps">
          {STEPS.map((stage, i) => {
            const label = stage === CONNECTING_STEP ? 'Connecting to server' : STEP_LABELS[stage] ?? stage;
            if (i === currentIndex) {
              return (
                <div key={stage} className="dl-step dl-step-current">
                  <span className="dl-step-spinner" />
                  <div>
                    <div className="dl-step-title">{label}</div>
                    <div className="dl-step-meta">{elapsed}s elapsed · usually under a minute</div>
                  </div>
                </div>
              );
            }
            if (i < currentIndex) {
              return (
                <div key={stage} className="dl-step dl-step-done">
                  <span className="dl-step-check">✓</span>
                  {label}
                </div>
              );
            }
            return (
              <div key={stage} className="dl-step dl-step-pending">
                <span className="dl-step-dot" />
                {label}
              </div>
            );
          })}

          {notifySupported && (
            <button type="button" className="dl-notify-btn" onClick={onEnableNotify}>
              {notifyEnabled ? "✓ We'll notify you when it's ready" : "🔔 Notify me when it's ready"}
            </button>
          )}
          <button type="button" className="dl-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
