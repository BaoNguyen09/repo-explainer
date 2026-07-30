import { useRef } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { FiZoomIn, FiZoomOut, FiMaximize2, FiCopy, FiDownload, FiFile } from 'react-icons/fi';
import { useMermaidRender } from '../../hooks/useMermaidRender';
import { copyMermaidSvg, downloadMermaidPng, downloadMermaidSvg } from '../../utils/mermaidExport';
import { MermaidRenderError } from './MermaidRenderError';
import './MermaidDiagram.css';

interface MermaidDiagramProps {
  code: string;
  diagramId: string;
}

export function MermaidDiagram({ code, diagramId }: MermaidDiagramProps) {
  const { svgContent, isRendered, error } = useMermaidRender(code, diagramId);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

  if (error) {
    return <MermaidRenderError />;
  }

  if (!isRendered) {
    return (
      <div className="mermaid-loading">
        <p>Rendering diagram...</p>
      </div>
    );
  }

  return (
    <div className="mermaid-container">
      <div className="mermaid-controls">
        <div className="mermaid-controls-left">
          <span className="mermaid-label">Interactive Diagram</span>
        </div>
        <div className="mermaid-controls-right">
          <button
            className="mermaid-control-btn"
            onClick={() => copyMermaidSvg(svgContent)}
            title="Copy diagram"
            aria-label="Copy diagram"
          >
            <FiCopy />
          </button>
          <button
            className="mermaid-control-btn"
            onClick={() => downloadMermaidSvg(svgContent, diagramId)}
            title="Export as SVG"
            aria-label="Export as SVG"
          >
            <FiFile />
          </button>
          <button
            className="mermaid-control-btn"
            onClick={() => downloadMermaidPng(svgContent, diagramId)}
            title="Export as PNG"
            aria-label="Export as PNG"
          >
            <FiDownload />
          </button>
        </div>
      </div>
      <div className="mermaid-wrapper" ref={containerRef}>
        <TransformWrapper
          initialScale={1}
          minScale={0.1}
          maxScale={10}
          wheel={{ step: 0.1 }}
          panning={{ disabled: false }}
          doubleClick={{ disabled: false }}
          centerOnInit={true}
          limitToBounds={false}
          onInit={(ref) => {
            transformRef.current = ref;
            // Center the view after a short delay to ensure SVG is rendered
            setTimeout(() => {
              if (ref && isRendered) {
                ref.centerView(1, 200);
              }
            }, 200);
          }}
        >
          {({ zoomIn, zoomOut, centerView }) => (
            <>
              <div className="mermaid-zoom-controls">
                <button
                  className="mermaid-zoom-btn"
                  onClick={() => zoomIn()}
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  <FiZoomIn />
                </button>
                <button
                  className="mermaid-zoom-btn"
                  onClick={() => zoomOut()}
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  <FiZoomOut />
                </button>
                <button
                  className="mermaid-zoom-btn"
                  onClick={() => {
                    // Use centerView with scale 1 to both reset and center
                    centerView(1, 200);
                  }}
                  title="Reset zoom and center"
                  aria-label="Reset zoom and center"
                >
                  <FiMaximize2 />
                </button>
              </div>
              <TransformComponent
                wrapperClass="mermaid-transform-wrapper"
                contentClass="mermaid-content"
              >
                <div
                  dangerouslySetInnerHTML={{ __html: svgContent }}
                />
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>
    </div>
  );
}
