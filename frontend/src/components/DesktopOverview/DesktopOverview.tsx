import { useCallback, useRef, useState } from 'react';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { MermaidDiagramPreview } from '../MermaidDiagram/MermaidDiagramPreview';
import { DesktopChatPanel } from '../DesktopChatPanel';
import { DownloadIcon } from '../../assets/icons/DownloadIcon';
import { GripIcon } from '../../assets/icons/GripIcon';
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
const RAIL_MIN_WIDTH = 320;
const RAIL_MAX_WIDTH = 720;
const RAIL_DEFAULT_WIDTH = 400;

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
  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT_WIDTH);
  const resizeStartRef = useRef({ x: 0, width: RAIL_DEFAULT_WIDTH });
  const repoName = `${owner}/${repo}`;
  const diagramCode = extractFirstMermaidBlock(data.explanation);

  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    resizeStartRef.current = { x: e.clientX, width: railWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [railWidth]);

  const handleResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const { x, width } = resizeStartRef.current;
    const next = width + (x - e.clientX);
    setRailWidth(Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, next)));
  }, []);

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
            <DownloadIcon />
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

        <div className="do-rail" style={{ width: railWidth }}>
          <div
            className="do-rail-resize-handle"
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
          >
            <GripIcon className="do-rail-resize-grip" />
          </div>
          {chatOpen ? (
            <DesktopChatPanel
              owner={owner}
              repo={repo}
              explanation={data.explanation}
              defaultBranch={data.default_branch}
              suggestedQuestions={data.suggested_questions}
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
