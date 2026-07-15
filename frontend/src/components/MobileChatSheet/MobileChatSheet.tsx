import { useEffect, useRef, useState } from 'react';
import { useChat } from '../../hooks/useChat';
import { track } from '../../config/analytics';
import { MarkdownRenderer } from '../MarkdownRenderer';
import './MobileChatSheet.css';

interface MobileChatSheetProps {
  owner: string;
  repo: string;
  explanation: string;
  defaultBranch: string;
  onClose: () => void;
  onOpenDiagram: (code: string, diagramId: string) => void;
}

const SUGGESTIONS = ['How does routing work?', 'Where is auth handled?', 'Explain the test setup'];

const INTRO_TEXT =
  "I've read the overview of this repo. Ask me anything — files, flows, setup, or implementation details.";

export function MobileChatSheet({ owner, repo, explanation, defaultBranch, onClose, onOpenDiagram }: MobileChatSheetProps) {
  const { messages, streamingMessage, status, isResponding, connectionState, sendMessage } = useChat(
    owner,
    repo,
    explanation,
    defaultBranch,
  );
  const [input, setInput] = useState('');
  const threadEndRef = useRef<HTMLDivElement>(null);

  const isThinking = (isResponding || status !== null) && !streamingMessage;
  const canSend = input.trim().length > 0 && !isResponding && connectionState === 'open';

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage, status]);

  useEffect(() => {
    track('chat_opened', { owner, repo, repo_full: `${owner}/${repo}` });
  }, [owner, repo]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isResponding || connectionState !== 'open') return;
    sendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="mcs-overlay" role="dialog" aria-modal="true">
      <div className="mcs-sheet">
        <div className="mcs-header">
          <div className="mcs-title-block">
            <div className="mcs-title">
              Ask about {owner}/{repo}
            </div>
            <div className="mcs-meta">Grounded in the overview</div>
          </div>
          <button type="button" className="mcs-close-btn" onClick={onClose} aria-label="Close chat">
            ✕
          </button>
        </div>

        <div className="mcs-thread">
          {messages.length === 0 && (
            <div className="mcs-msg mcs-msg-bot">
              <img src="/logo.png" alt="" className="mcs-bot-avatar" />
              <div className="mcs-bubble mcs-bubble-bot">{INTRO_TEXT}</div>
            </div>
          )}

          {messages
            .filter((msg) => msg.role !== 'tool')
            .map((msg, i) =>
              msg.role === 'user' ? (
                <div key={`${msg.timestamp}-${i}`} className="mcs-msg mcs-msg-user">
                  <div className="mcs-bubble mcs-bubble-user">{msg.content}</div>
                </div>
              ) : (
                <div key={`${msg.timestamp}-${i}`} className="mcs-msg mcs-msg-bot">
                  <img src="/logo.png" alt="" className="mcs-bot-avatar" />
                  <div className="mcs-bubble mcs-bubble-bot">
                    <MarkdownRenderer
                      content={msg.content}
                      owner={owner}
                      repo={repo}
                      branch={defaultBranch}
                      mermaidMode="preview"
                      onOpenDiagram={onOpenDiagram}
                    />
                  </div>
                </div>
              ),
            )}

          {streamingMessage && (
            <div className="mcs-msg mcs-msg-bot">
              <img src="/logo.png" alt="" className="mcs-bot-avatar" />
              <div className="mcs-bubble mcs-bubble-bot">
                <MarkdownRenderer
                  content={streamingMessage}
                  owner={owner}
                  repo={repo}
                  branch={defaultBranch}
                  mermaidMode="preview"
                  onOpenDiagram={onOpenDiagram}
                />
              </div>
            </div>
          )}

          {isThinking && (
            <div className="mcs-msg mcs-msg-bot">
              <img src="/logo.png" alt="" className="mcs-bot-avatar" />
              <div className="mcs-thinking">
                <span className="mcs-thinking-dot" />
                <span className="mcs-thinking-text">Reading the repo…</span>
              </div>
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        <div className="mcs-composer">
          {messages.length === 0 && (
            <div className="mcs-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="mcs-suggestion-chip" onClick={() => setInput(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="mcs-input-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about files, flows, setup…"
              className="mcs-input"
              disabled={connectionState !== 'open'}
            />
            <button
              type="button"
              className="mcs-send-btn"
              onClick={() => send(input)}
              disabled={!canSend}
              aria-label="Send message"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
