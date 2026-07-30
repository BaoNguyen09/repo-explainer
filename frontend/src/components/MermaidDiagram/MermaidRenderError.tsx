import './MermaidRenderError.css';

/** Fault-tolerant fallback for when mermaid fails to parse/render AI-generated
 * diagram syntax — shown instead of the pan/zoom/export UI, which has nothing
 * valid to operate on. */
export function MermaidRenderError() {
  return (
    <div className="mermaid-render-error">
      <p className="mermaid-render-error-title">⚠️ Couldn't render this diagram</p>
      <p className="mermaid-render-error-hint">
        The generated diagram had invalid syntax. Try regenerating the explanation to get a new one.
      </p>
    </div>
  );
}
