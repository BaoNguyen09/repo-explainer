import { useState } from 'react';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { MermaidDiagramPreview } from '../MermaidDiagram/MermaidDiagramPreview';
import { DesktopChatPanel } from '../DesktopChatPanel';
import { downloadTextFile } from '../../utils/downloadText';
import { extractFirstMermaidBlock } from '../../utils/extractMermaid';
import type { FormResult } from '../../types';
import './DesktopOverview.css';

interface DesktopOverviewProps {
  data: FormResult;
  owner: string;
  repo: string;
  isStoredOverview: boolean;
  onBack: () => void;
  onRegenerate: () => void;
  onOpenDiagram: (code: string, diagramId: string) => void;
}

const DIAGRAM_ID = 'overview-architecture';

export function DesktopOverview({
  data,
  owner,
  repo,
  isStoredOverview,
  onBack,
  onRegenerate,
  onOpenDiagram,
}: DesktopOverviewProps) {
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const repoName = `${owner}/${repo}`;
  const diagramCode = extractFirstMermaidBlock(data.explanation);

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
    <div className="do-screen">
      <div className="do-app-bar">
        <div className="do-app-bar-left">
          <button type="button" className="do-icon-btn" onClick={onBack} aria-label="Back">
            ←
          </button>
          <div className="do-title-block">
            <div className="do-title">{repoName}</div>
            <div className="do-meta">{isStoredOverview ? 'Saved in this browser' : 'Fresh overview · just now'}</div>
          </div>
        </div>
        <div className="do-app-bar-right">
          <button type="button" className="do-icon-btn" onClick={copyAll} title="Copy all" aria-label="Copy all">
            {copied ? '✓' : '⧉'}
          </button>
          <button type="button" className="do-icon-btn" onClick={download} title="Download .txt" aria-label="Download .txt">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>
          <button type="button" className="do-icon-btn" onClick={onRegenerate} title="Regenerate" aria-label="Regenerate">
            ↻
          </button>
        </div>
      </div>

      <div className="do-body">
        <div className="do-reading">
          <div className="do-reading-inner">
            <MarkdownRenderer
              content={data.explanation}
              owner={owner}
              repo={repo}
              branch={data.default_branch}
              mermaidMode="hidden"
            />
          </div>
        </div>

        <div className="do-rail">
          {chatOpen ? (
            <DesktopChatPanel
              owner={owner}
              repo={repo}
              explanation={data.explanation}
              defaultBranch={data.default_branch}
              onClose={() => setChatOpen(false)}
              onOpenDiagram={onOpenDiagram}
            />
          ) : (
            <div className="do-rail-default">
              {diagramCode && (
                <>
                  <span className="do-rail-label">Architecture</span>
                  <div className="do-rail-diagram">
                    <MermaidDiagramPreview
                      code={diagramCode}
                      diagramId={DIAGRAM_ID}
                      onOpenFullscreen={() => onOpenDiagram(diagramCode, DIAGRAM_ID)}
                    />
                  </div>
                </>
              )}
              <button type="button" className="do-ask-btn" onClick={() => setChatOpen(true)}>
                💬 Ask about this repo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
