import { useEffect, useState } from 'react';
import mermaid from 'mermaid';
import { initializeMermaid } from '../utils/mermaidInit';

interface UseMermaidRenderReturn {
  svgContent: string;
  isRendered: boolean;
  /** Set when mermaid failed to parse/render `code` (e.g. invalid AI-generated syntax).
   *  Callers should show a fault-tolerant error state instead of the pan/zoom/export UI. */
  error: string | null;
}

/** Renders mermaid `code` to an SVG string once. Shared by the desktop interactive
 * diagram and the mobile static preview / fullscreen viewer. */
export function useMermaidRender(code: string, diagramId: string): UseMermaidRenderReturn {
  const [svgContent, setSvgContent] = useState('');
  const [isRendered, setIsRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || !code.trim()) return;
    if (isRendered || error) return;

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
      } catch (renderError) {
        if (!isMounted) return;

        console.error('Mermaid rendering error:', renderError);
        setError(renderError instanceof Error ? renderError.message : 'Unknown error');
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [code, diagramId, isRendered, error]);

  return { svgContent, isRendered, error };
}
