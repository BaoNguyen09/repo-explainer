import { useEffect, useState } from 'react';
import mermaid from 'mermaid';
import { initializeMermaid } from '../utils/mermaidInit';

interface UseMermaidRenderReturn {
  svgContent: string;
  isRendered: boolean;
}

/** Renders mermaid `code` to an SVG string once. Shared by the desktop interactive
 * diagram and the mobile static preview / fullscreen viewer. */
export function useMermaidRender(code: string, diagramId: string): UseMermaidRenderReturn {
  const [svgContent, setSvgContent] = useState('');
  const [isRendered, setIsRendered] = useState(false);

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

  return { svgContent, isRendered };
}
