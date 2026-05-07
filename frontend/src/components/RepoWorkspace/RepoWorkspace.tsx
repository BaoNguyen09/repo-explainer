import { useState } from 'react';
import type { FormResult } from '../../types';
import { ChatInterface } from '../ChatInterface';
import { ResultDisplay } from '../ResultDisplay';
import './RepoWorkspace.css';

interface RepoWorkspaceProps {
  data: FormResult;
  owner: string;
  repo: string;
  isStoredOverview: boolean;
  onRegenerate: () => void;
}

type WorkspaceView = 'overview' | 'chat';

export function RepoWorkspace({ data, owner, repo, isStoredOverview, onRegenerate }: RepoWorkspaceProps) {
  const [activeView, setActiveView] = useState<WorkspaceView>('overview');

  return (
    <section className="repo-workspace">
      <div className="repo-workspace-header">
        <div>
          <h3>Repository workspace</h3>
          <div className="repo-workspace-meta">
            <span className={`repo-workspace-cache${isStoredOverview ? ' repo-workspace-cache-active' : ''}`}>
              {isStoredOverview ? 'Saved in this browser' : 'Fresh overview'}
            </span>
            <button type="button" className="repo-workspace-regenerate" onClick={onRegenerate}>
              Regenerate
            </button>
          </div>
        </div>
        <div className="repo-workspace-toggle" role="tablist" aria-label="Repository workspace view">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'overview'}
            className={`repo-workspace-tab${activeView === 'overview' ? ' repo-workspace-tab-active' : ''}`}
            onClick={() => setActiveView('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'chat'}
            className={`repo-workspace-tab${activeView === 'chat' ? ' repo-workspace-tab-active' : ''}`}
            onClick={() => setActiveView('chat')}
          >
            Chat
          </button>
        </div>
      </div>

      <div className="repo-workspace-panel">
        {activeView === 'overview' ? (
          <ResultDisplay data={data} embedded />
        ) : (
          <ChatInterface owner={owner} repo={repo} explanation={data.explanation} defaultBranch={data.default_branch} embedded />
        )}
      </div>
    </section>
  );
}
