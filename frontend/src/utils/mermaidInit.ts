import mermaid from 'mermaid';

let isInitialized = false;

export function initializeMermaid() {
  if (isInitialized) return;
  
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
  });
  
  isInitialized = true;
}


