import { useState } from 'react';
import { FiCopy, FiCheck } from 'react-icons/fi';
import './ShellCodeBlock.css';

interface ShellCodeBlockProps {
  code: string;
  language?: string;
}

export function ShellCodeBlock({ code, language }: ShellCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="shell-code-block-wrapper">
      <div className="shell-code-block-header">
        {language && <span className="shell-code-language">{language}</span>}
        <button
          className="shell-code-copy-btn"
          onClick={handleCopy}
          title={copied ? 'Copied!' : 'Copy code'}
          aria-label="Copy code"
        >
          {copied ? <FiCheck /> : <FiCopy />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="shell-code-block">
        <code>{code}</code>
      </pre>
    </div>
  );
}

