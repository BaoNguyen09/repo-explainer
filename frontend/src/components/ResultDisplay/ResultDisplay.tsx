import { useState } from 'react';
import { FiCopy, FiDownload, FiCheck } from 'react-icons/fi';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { downloadTextFile } from '../../utils/downloadText';
import type { FormResult } from '../../types';
import './ResultDisplay.css';

interface ResultDisplayProps {
  data: FormResult | null;
  embedded?: boolean;
}

export function ResultDisplay({ data, embedded = false }: ResultDisplayProps) {
  const [copied, setCopied] = useState(false);

  if (!data) {
    return null;
  }

  const [owner, repo] = data.repo.split('/');

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
      downloadTextFile(data.explanation, `repo-explanation-${data.repo.replace('/', '-')}.txt`);
    } catch (error) {
      console.error('Failed to download:', error);
      alert('Failed to download file');
    }
  };
  
  return (
    <div className={`result-container${embedded ? ' result-container-embedded' : ''}`}>
      <div className="result-header">
        <h3>Repository Explanation</h3>
        <div className="result-actions">
          <button
            className="copy-all-btn"
            onClick={handleCopyAll}
            title={copied ? 'Copied!' : 'Copy all as raw text'}
            aria-label="Copy all as raw text"
            data-copied={copied}
          >
            {copied ? <FiCheck /> : <FiCopy />}
            <span>{copied ? 'Copied!' : 'Copy all'}</span>
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
          <MarkdownRenderer content={data.explanation} owner={owner} repo={repo} branch={data.default_branch} />
        </div>
      </div>
    </div>
  );
}
