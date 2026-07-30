import mermaid from 'mermaid';

let isInitialized = false;

export function initializeMermaid() {
  if (isInitialized) return;
  
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    // Without this, a parse error makes mermaid inject its own "bomb" error SVG
    // straight into document.body (outside React, never cleaned up) instead of
    // just throwing. We already show our own error UI via useMermaidRender.
    suppressErrorRendering: true,
  });
  
  isInitialized = true;
}


