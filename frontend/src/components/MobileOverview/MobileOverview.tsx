import { useState } from 'react';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { downloadTextFile } from '../../utils/downloadText';
import type { FormResult } from '../../types';
import './MobileOverview.css';

interface MobileOverviewProps {
  data: FormResult;
  owner: string;
  repo: string;
  isStoredOverview: boolean;
  onBack: () => void;
  onRegenerate: () => void;
  onOpenChat: () => void;
  onOpenDiagram: (code: string, diagramId: string) => void;
}

export function MobileOverview({
  data,
  owner,
  repo,
  isStoredOverview,
  onBack,
  onRegenerate,
  onOpenChat,
  onOpenDiagram,
}: MobileOverviewProps) {
  const [copied, setCopied] = useState(false);
  const repoName = `${owner}/${repo}`;

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(data.explanation);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    }
  };

  const download = () => {
    downloadTextFile(data.explanation, `repo-explanation-${repoName.replace('/', '-')}.txt`);
  };

  return (
    <div className="mo-screen">
      <div className="mo-app-bar">
        <div className="mo-app-bar-left">
          <button type="button" className="mo-icon-btn" onClick={onBack} aria-label="Back">
            ←
          </button>
          <div className="mo-title-block">
            <div className="mo-title">{repoName}</div>
            <div className="mo-meta">{isStoredOverview ? 'Saved in this browser' : 'Fresh overview · just now'}</div>
          </div>
        </div>
        <div className="mo-app-bar-right">
          <button type="button" className="mo-icon-btn" onClick={copyAll} title="Copy all" aria-label="Copy all">
            {copied ? '✓' : '⧉'}
          </button>
          <button type="button" className="mo-icon-btn" onClick={download} title="Download .txt" aria-label="Download .txt">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>
          <button type="button" className="mo-icon-btn" onClick={onRegenerate} title="Regenerate" aria-label="Regenerate">
            ↻
          </button>
        </div>
      </div>

      <div className="mo-reading">
        <MarkdownRenderer
          content={data.explanation}
          owner={owner}
          repo={repo}
          branch={data.default_branch}
          mermaidMode="preview"
          onOpenDiagram={onOpenDiagram}
        />
      </div>

      <div className="mo-fab-row">
        <button type="button" className="mo-ask-pill" onClick={onOpenChat}>
          💬 Ask about this repo
        </button>
      </div>
    </div>
  );
}
