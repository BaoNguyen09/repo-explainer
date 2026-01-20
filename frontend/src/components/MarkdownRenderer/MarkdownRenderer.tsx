import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from '../MermaidDiagram';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const mermaidRef = useRef<number>(0);

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1].toLowerCase() : '';
            
            // Handle children which might be an array, string, or ReactNode
            let codeString = '';
            if (Array.isArray(children)) {
              codeString = children
                .map((child) => (typeof child === 'string' ? child : String(child)))
                .join('');
            } else if (typeof children === 'string') {
              codeString = children;
            } else {
              codeString = String(children);
            }
            
            const trimmedCode = codeString.replace(/\n$/, '');

            // Only render as Mermaid if explicitly marked as 'mermaid'
            // Explicitly exclude other languages like 'shell', 'bash', etc.
            if (language === 'mermaid') {
              const diagramId = `diagram-${mermaidRef.current++}`;
              return (
                <MermaidDiagram code={trimmedCode} diagramId={diagramId} />
              );
            }

            // For all other code blocks (including shell, bash, etc.), render normally
            // ReactMarkdown automatically wraps code blocks in <pre> tags
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

