import { useEffect, useRef, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { FiZoomIn, FiZoomOut, FiMaximize2, FiCopy, FiDownload, FiFile } from 'react-icons/fi';
import mermaid from 'mermaid';
import { initializeMermaid } from '../../utils/mermaidInit';
import './MermaidDiagram.css';

interface MermaidDiagramProps {
  code: string;
  diagramId: string;
}

export function MermaidDiagram({ code, diagramId }: MermaidDiagramProps) {
  const [svgContent, setSvgContent] = useState<string>('');
  const [isRendered, setIsRendered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<any>(null);

  useEffect(() => {
    if (!code || !code.trim()) return;
    if (isRendered) return;

    let isMounted = true;

    const renderDiagram = async () => {
      try {
        initializeMermaid();

        const id = `mermaid-${diagramId}-${Date.now()}`;
        const result = await mermaid.render(id, code.trim());
        
        if (!isMounted) return;
        
        if (result && result.svg) {
          setSvgContent(result.svg);
          setIsRendered(true);
          // Center the diagram after rendering
          setTimeout(() => {
            if (transformRef.current) {
              transformRef.current.centerView(1, 0);
            }
          }, 300);
        } else {
          throw new Error('Mermaid returned empty result');
        }
      } catch (error) {
        if (!isMounted) return;
        
        console.error('Mermaid rendering error:', error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        setSvgContent(`<div style="padding: 2rem; color: #c33;"><pre>Error rendering diagram: ${errorMsg}\n\nCode:\n${code.substring(0, 200)}...</pre></div>`);
        setIsRendered(true);
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [code, diagramId, isRendered]);

  const handleCopy = async () => {
    if (!svgContent) return;
    
    try {
      // Copy SVG as text
      await navigator.clipboard.writeText(svgContent);
      alert('Diagram copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Failed to copy diagram');
    }
  };

  const handleExport = (format: 'svg' | 'png') => {
    if (!svgContent) return;

    if (format === 'svg') {
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `diagram-${diagramId}.svg`;
      link.click();
      URL.revokeObjectURL(url);
    } else if (format === 'png') {
      // Convert SVG to PNG using the raw SVG content
      try {
        // Parse the SVG string to extract dimensions
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
        const svgElement = svgDoc.querySelector('svg');
        
        if (!svgElement) {
          alert('Could not parse SVG content');
          return;
        }

        // Extract dimensions from viewBox or width/height attributes
        let width = 1200;
        let height = 800;
        
        const viewBox = svgElement.getAttribute('viewBox');
        if (viewBox) {
          const parts = viewBox.split(/\s+/);
          if (parts.length >= 4) {
            width = parseFloat(parts[2]) || width;
            height = parseFloat(parts[3]) || height;
          }
        } else {
          const svgWidth = svgElement.getAttribute('width');
          const svgHeight = svgElement.getAttribute('height');
          if (svgWidth) width = parseFloat(svgWidth.replace(/px|em|rem/, '')) || width;
          if (svgHeight) height = parseFloat(svgHeight.replace(/px|em|rem/, '')) || height;
        }

        // Ensure SVG has explicit dimensions
        svgElement.setAttribute('width', width.toString());
        svgElement.setAttribute('height', height.toString());
        svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

        // Serialize the SVG
        const svgData = new XMLSerializer().serializeToString(svgElement);
        
        // Create image and canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          alert('Canvas context not available');
          return;
        }

        const img = new Image();
        
        // Use data URL instead of blob URL to avoid CORS issues
        // Encode SVG as base64 data URL
        const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
        const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;

        img.onload = () => {
          try {
            // Set canvas dimensions
            canvas.width = width;
            canvas.height = height;
            
            // Fill white background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw the SVG image
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert canvas to blob and trigger download
            canvas.toBlob((blob) => {
              if (blob) {
                const downloadUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = `diagram-${diagramId}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(downloadUrl);
              } else {
                alert('Failed to create PNG blob');
              }
            }, 'image/png', 1.0);
          } catch (error) {
            console.error('Error converting to PNG:', error);
            alert('Failed to convert diagram to PNG: ' + (error instanceof Error ? error.message : 'Unknown error'));
          }
        };

        img.onerror = () => {
          console.error('Failed to load SVG image');
          alert('Failed to load SVG for PNG conversion');
        };

        // Set image source using data URL (no CORS issues)
        img.src = dataUrl;
      } catch (error) {
        console.error('PNG export error:', error);
        alert('Failed to export diagram as PNG: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    }
  };

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
            onClick={handleCopy}
            title="Copy diagram"
            aria-label="Copy diagram"
          >
            <FiCopy />
          </button>
          <button
            className="mermaid-control-btn"
            onClick={() => handleExport('svg')}
            title="Export as SVG"
            aria-label="Export as SVG"
          >
            <FiFile />
          </button>
          <button
            className="mermaid-control-btn"
            onClick={() => handleExport('png')}
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
          {({ zoomIn, zoomOut, resetTransform, centerView }) => (
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

