import { useState } from 'react';
import { FiCopy, FiDownload } from 'react-icons/fi';
import { MarkdownRenderer } from '../MarkdownRenderer';
import type { FormResult } from '../../types';
import './ResultDisplay.css';

interface ResultDisplayProps {
  data: FormResult | null;
}

export function ResultDisplay({ data }: ResultDisplayProps) {
  const [copied, setCopied] = useState(false);

  if (!data) {
    return null;
  }

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(data.explanation);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Failed to copy to clipboard');
    }
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([data.explanation], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `repo-explanation-${data.repo.replace('/', '-')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download:', error);
      alert('Failed to download file');
    }
  };
  
  return (
    <div className="result-container">
      <div className="result-header">
        <h3>Repository Explanation</h3>
        <div className="result-actions">
          <button
            className="copy-all-btn"
            onClick={handleCopyAll}
            title="Copy all as raw text"
            aria-label="Copy all as raw text"
            data-copied={copied}
          >
            <FiCopy />
            <span>Copy all</span>
          </button>
          <button
            className="download-btn"
            onClick={handleDownload}
            title="Download as text file"
            aria-label="Download as text file"
          >
            <FiDownload />
            <span>Download</span>
          </button>
        </div>
      </div>
      <div className="repo-info">
        <strong>Repository:</strong> {data.repo}
      </div>
      <div className="explanation">
        <div className="explanation-scroll">
          <MarkdownRenderer content={data.explanation} />
        </div>
      </div>
    </div>
  );
}

