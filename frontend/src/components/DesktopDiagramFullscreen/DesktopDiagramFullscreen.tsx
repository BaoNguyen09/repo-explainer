import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { FiDownload } from 'react-icons/fi';
import { useMermaidRender } from '../../hooks/useMermaidRender';
import { copyMermaidSvg, downloadMermaidPng } from '../../utils/mermaidExport';
import { MermaidRenderError } from '../MermaidDiagram/MermaidRenderError';
import './DesktopDiagramFullscreen.css';

interface DesktopDiagramFullscreenProps {
  code: string;
  diagramId: string;
  repoName: string;
  onClose: () => void;
}

export function DesktopDiagramFullscreen({ code, diagramId, repoName, onClose }: DesktopDiagramFullscreenProps) {
  const { svgContent, isRendered, error } = useMermaidRender(code, diagramId);

  return (
    <div className="ddf-screen">
      <div className="ddf-app-bar">
        <div className="ddf-title-block">
          <div className="ddf-title">Architecture diagram</div>
          <div className="ddf-meta">{repoName} · drag to pan, buttons to zoom</div>
        </div>
        <button type="button" className="ddf-close-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="ddf-canvas">
        {error ? (
          <MermaidRenderError />
        ) : !isRendered ? (
          <div className="ddf-loading">Rendering diagram...</div>
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
                <TransformComponent wrapperClass="ddf-transform-wrapper" contentClass="ddf-transform-content">
                  <div dangerouslySetInnerHTML={{ __html: svgContent }} />
                </TransformComponent>
                <div className="ddf-zoom-controls">
                  <button type="button" className="ddf-zoom-btn" onClick={() => zoomIn()} aria-label="Zoom in">
                    ＋
                  </button>
                  <button type="button" className="ddf-zoom-btn" onClick={() => zoomOut()} aria-label="Zoom out">
                    −
                  </button>
                  <button
                    type="button"
                    className="ddf-zoom-btn"
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
        <div className="ddf-action-bar">
          <button type="button" className="ddf-action-btn" onClick={() => copyMermaidSvg(svgContent)}>
            ⧉ Copy SVG
          </button>
          <button type="button" className="ddf-action-btn" onClick={() => downloadMermaidPng(svgContent, diagramId)}>
            <FiDownload />Download PNG
          </button>
        </div>
      )}
    </div>
  );
}
