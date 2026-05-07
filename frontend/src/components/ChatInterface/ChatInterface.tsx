import { useEffect, useRef, useState } from 'react';
import { useChat } from '../../hooks/useChat';
import { clearStoredRepoMessages } from '../../utils/repoStorage';
import { MarkdownRenderer } from '../MarkdownRenderer';
import type { ChatMessage, ChatStyle, ChatToolEvent } from '../../types';
import './ChatInterface.css';

interface ChatInterfaceProps {
  owner: string;
  repo: string;
  explanation: string;
  defaultBranch: string;
  embedded?: boolean;
}

const MAX_MESSAGE_LENGTH = 1000;

const STATUS_LABELS: Record<string, string> = {
  thinking: 'Thinking...',
  reading_file: 'Reading file',
  listing_directory: 'Listing directory',
};

function formatStatus(stage: string, path?: string): string {
  const label = STATUS_LABELS[stage] ?? stage;
  return path ? `${label}: ${path}` : label;
}

function formatToolEvent(tool: string, path: string): string {
  if (tool === 'read_file') {
    return path ? `Reading ${path}` : 'Reading file';
  }
  if (tool === 'list_directory') {
    return path ? `Listing ${path}` : 'Listing directory';
  }
  return path ? `${tool}: ${path}` : tool;
}

function StyleButton({
  active,
  label,
  title,
  onClick,
}: {
  active: boolean;
  label: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`chat-style-btn${active ? ' chat-style-btn-active' : ''}`}
      title={title}
      aria-label={title ?? label}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function ChatInterface({ owner, repo, explanation, defaultBranch, embedded = false }: ChatInterfaceProps) {
  const { messages, streamingMessage, toolEvents, status, isResponding, connectionState, style, sendMessage, setStyle, clearMessages } = useChat(
    owner,
    repo,
    explanation,
    defaultBranch,
  );
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isWaiting = isResponding || status !== null;
  const charsLeft = MAX_MESSAGE_LENGTH - input.length;
  const canSend = input.trim().length > 0 && !isWaiting && connectionState === 'open';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, status]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    sendMessage(input.trim());
    setInput('');
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        sendMessage(input.trim());
        setInput('');
      }
    }
  }

  function handleStyleChange(nextStyle: ChatStyle) {
    setStyle(nextStyle);
  }

  function handleClearChat() {
    clearStoredRepoMessages(owner, repo);
    clearMessages();
  }

  return (
    <div className={`chat-container${embedded ? ' chat-container-embedded' : ''}`}>
      <div className="chat-header">
        <div>
          <h3>Chat with this repo</h3>
          <div className="chat-header-info">
            <span className={`connection-dot ${connectionState}`} title={`WebSocket: ${connectionState}`} />
            <span>
              {connectionState === 'open'
                ? 'Connected'
                : connectionState === 'connecting'
                  ? 'Connecting'
                  : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="chat-controls">
          <div className="chat-style-group" role="group" aria-label="Chat style">
            <StyleButton active={style === 'normal'} label="Normal" onClick={() => handleStyleChange('normal')} />
            <StyleButton
              active={style === 'caveman'}
              label="Caveman"
              title="Ultra-brief mode. Keeps technical meaning, cuts filler and extra words."
              onClick={() => handleStyleChange('caveman')}
            />
          </div>
          <button type="button" className="chat-clear-btn" onClick={handleClearChat}>
            Clear chat
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !status && (
          <div className="chat-empty">
            Ask a question about <strong>{owner}/{repo}</strong> to get started.
          </div>
        )}

        {messages.map((msg: ChatMessage, i: number) => (
          msg.role === 'tool' ? (
            <div key={`${msg.timestamp}-${i}`} className="chat-tool-event chat-tool-event-persisted">
              <span className="chat-tool-event-dot" />
              <span>{msg.content}</span>
            </div>
          ) : (
            <div key={`${msg.timestamp}-${i}`} className={`chat-message chat-message-${msg.role}`}>
              <div className="chat-message-label">{msg.role === 'user' ? 'You' : 'RepoExplainer'}</div>
              <div className="chat-message-content">
                {msg.role === 'assistant' ? <MarkdownRenderer content={msg.content} owner={owner} repo={repo} branch={defaultBranch} /> : <p>{msg.content}</p>}
              </div>
            </div>
          )
        ))}

        {toolEvents.length > 0 && (
          <div className="chat-tool-events">
            {toolEvents.map((event: ChatToolEvent) => (
              <div key={event.id} className="chat-tool-event">
                <span className="chat-tool-event-dot" />
                <span>{formatToolEvent(event.tool, event.path)}</span>
              </div>
            ))}
          </div>
        )}

        {streamingMessage && (
          <div className="chat-message chat-message-assistant chat-message-streaming">
            <div className="chat-message-label">RepoExplainer</div>
            <div className="chat-message-content">
              <MarkdownRenderer content={streamingMessage} owner={owner} repo={repo} branch={defaultBranch} />
            </div>
          </div>
        )}

        {status && (
          <div className="chat-status">
            <span className="chat-status-dot" />
            {formatStatus(status.stage, status.path)}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about this repository..."
            disabled={isWaiting || connectionState !== 'open'}
            rows={1}
          />
          <button type="submit" className="chat-send-btn" disabled={!canSend} title="Send message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div className="chat-input-footer">
          <span className={`char-count ${charsLeft < 100 ? 'char-count-warn' : ''}`}>{charsLeft}</span>
        </div>
      </form>
    </div>
  );
}
