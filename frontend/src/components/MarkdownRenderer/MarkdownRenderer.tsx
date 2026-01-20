import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidDiagram } from '../MermaidDiagram';
import { ShellCodeBlock } from '../ShellCodeBlock';
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
          pre({ children, ...props }) {
            // Check if the pre contains a code element with shell/bash language
            if (children && typeof children === 'object' && 'props' in children) {
              const codeProps = children.props as { className?: string; children?: unknown };
              const className = codeProps?.className || '';
              const match = /language-(\w+)/.exec(className);
              const language = match ? match[1].toLowerCase() : '';
              
              if (language === 'shell' || language === 'bash' || language === 'sh') {
                // Extract code content
                const codeChildren = codeProps?.children;
                let codeString = '';
                if (Array.isArray(codeChildren)) {
                  codeString = codeChildren
                    .map((child) => (typeof child === 'string' ? child : String(child)))
                    .join('');
                } else if (typeof codeChildren === 'string') {
                  codeString = codeChildren;
                } else if (codeChildren !== undefined && codeChildren !== null) {
                  codeString = String(codeChildren);
                }
                
                const trimmedCode = codeString.replace(/\n$/, '');
                return <ShellCodeBlock code={trimmedCode} language={language} />;
              }
            }
            
            // For other pre blocks, render normally
            return <pre {...props}>{children}</pre>;
          },
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
            if (language === 'mermaid') {
              const diagramId = `diagram-${mermaidRef.current++}`;
              return (
                <MermaidDiagram code={trimmedCode} diagramId={diagramId} />
              );
            }

            // For inline code (no className), render normally
            if (!className) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }

            // For code blocks, let the pre handler take care of shell/bash
            // Otherwise render normally
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

