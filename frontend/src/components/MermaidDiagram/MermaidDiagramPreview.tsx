import { useMermaidRender } from '../../hooks/useMermaidRender';
import { MermaidRenderError } from './MermaidRenderError';
import './MermaidDiagramPreview.css';

interface MermaidDiagramPreviewProps {
  code: string;
  diagramId: string;
  onOpenFullscreen: () => void;
}

/**
 * Static (non-pannable) mermaid preview for mobile: the diagram scrolls with the page
 * like any other content, and tapping it opens the dedicated fullscreen pan/zoom viewer
 * instead of capturing touch gestures inline.
 */
export function MermaidDiagramPreview({ diagramId, onOpenFullscreen, ...props }: MermaidDiagramPreviewProps) {
  const { svgContent, isRendered, error } = useMermaidRender(props.code, diagramId);

  if (error) {
    return (
      <div className="mermaid-preview-card">
        <MermaidRenderError />
      </div>
    );
  }

  return (
    <div className="mermaid-preview-card">
      <button
        type="button"
        className="mermaid-preview-canvas"
        onClick={onOpenFullscreen}
        aria-label="Open diagram fullscreen"
      >
        {isRendered ? (
          <div className="mermaid-preview-svg" dangerouslySetInnerHTML={{ __html: svgContent }} />
        ) : (
          <span className="mermaid-preview-loading">Rendering diagram...</span>
        )}
      </button>
      <div className="mermaid-preview-footer">
        <span className="mermaid-preview-label">Architecture diagram</span>
        <button type="button" className="mermaid-preview-fullscreen-btn" onClick={onOpenFullscreen}>
          ⛶ Fullscreen
        </button>
      </div>
    </div>
  );
}
