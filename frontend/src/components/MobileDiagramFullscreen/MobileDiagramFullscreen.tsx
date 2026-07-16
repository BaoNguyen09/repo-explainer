import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useMermaidRender } from '../../hooks/useMermaidRender';
import { copyMermaidSvg, downloadMermaidPng } from '../../utils/mermaidExport';
import { MermaidRenderError } from '../MermaidDiagram/MermaidRenderError';
import './MobileDiagramFullscreen.css';

interface MobileDiagramFullscreenProps {
  code: string;
  diagramId: string;
  repoName: string;
  onClose: () => void;
}

export function MobileDiagramFullscreen({ code, diagramId, repoName, onClose }: MobileDiagramFullscreenProps) {
  const { svgContent, isRendered, error } = useMermaidRender(code, diagramId);

  return (
    <div className="mdf-screen">
      <div className="mdf-app-bar">
        <div className="mdf-title-block">
          <div className="mdf-title">Architecture diagram</div>
          <div className="mdf-meta">{repoName} · drag to pan, buttons to zoom</div>
        </div>
        <button type="button" className="mdf-close-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="mdf-canvas">
        {error ? (
          <MermaidRenderError />
        ) : !isRendered ? (
          <div className="mdf-loading">Rendering diagram...</div>
        ) : (
          <TransformWrapper
            initialScale={1}
            minScale={0.2}
            maxScale={6}
            wheel={{ step: 0.15 }}
            panning={{ disabled: false }}
            doubleClick={{ disabled: false }}
            centerOnInit
            limitToBounds={false}
          >
            {({ zoomIn, zoomOut, centerView }) => (
              <>
                <TransformComponent wrapperClass="mdf-transform-wrapper" contentClass="mdf-transform-content">
                  <div dangerouslySetInnerHTML={{ __html: svgContent }} />
                </TransformComponent>
                <div className="mdf-zoom-controls">
                  <button type="button" className="mdf-zoom-btn" onClick={() => zoomIn()} aria-label="Zoom in">
                    ＋
                  </button>
                  <button type="button" className="mdf-zoom-btn" onClick={() => zoomOut()} aria-label="Zoom out">
                    −
                  </button>
                  <button
                    type="button"
                    className="mdf-zoom-btn"
                    onClick={() => centerView(1, 200)}
                    title="Reset view"
                    aria-label="Reset view"
                  >
                    ⟲
                  </button>
                </div>
              </>
            )}
          </TransformWrapper>
        )}
      </div>

      {!error && (
        <div className="mdf-action-bar">
          <button type="button" className="mdf-action-btn" onClick={() => copyMermaidSvg(svgContent)}>
            ⧉ Copy SVG
          </button>
          <button type="button" className="mdf-action-btn" onClick={() => downloadMermaidPng(svgContent, diagramId)}>
            ↓ Download PNG
          </button>
        </div>
      )}
    </div>
  );
}
