import { useCallback, useEffect, useRef, useState } from 'react';
import { config } from '../config/api';
import { createUpdatedRepoState, loadStoredRepoState, saveStoredRepoState } from '../utils/repoStorage';
import type { ChatMessage, ChatStatus, ChatStyle, ChatToolEvent } from '../types';

export type ConnectionState = 'connecting' | 'open' | 'closed';

interface UseChatReturn {
  messages: ChatMessage[];
  streamingMessage: string;
  toolEvents: ChatToolEvent[];
  status: ChatStatus | null;
  isResponding: boolean;
  connectionState: ConnectionState;
  style: ChatStyle;
  sendMessage: (content: string) => void;
  setStyle: (style: ChatStyle) => void;
  clearMessages: () => void;
}

const PING_INTERVAL_MS = 30_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 16_000;
const MAX_CONTEXT_MESSAGES = 16;

export function toOutboundHistory(messages: ChatMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((message): message is ChatMessage & { role: 'user' | 'assistant' } => (
      message.role === 'user' || message.role === 'assistant'
    ))
    .slice(-MAX_CONTEXT_MESSAGES)
    .map(({ role, content: previousContent }) => ({ role, content: previousContent }));
}

export function useChat(owner: string, repo: string, explanation: string, defaultBranch: string): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [toolEvents, setToolEvents] = useState<ChatToolEvent[]>([]);
  const [style, setStyleState] = useState<ChatStyle>('normal');
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [hydrated, setHydrated] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_BASE_MS);
  const mountedRef = useRef(true);
  const messagesRef = useRef<ChatMessage[]>([]);
  const styleRef = useRef<ChatStyle>('normal');
  const toolEventsRef = useRef<ChatToolEvent[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    styleRef.current = style;
  }, [style]);

  useEffect(() => {
    toolEventsRef.current = toolEvents;
  }, [toolEvents]);

  useEffect(() => {
    const stored = loadStoredRepoState(owner, repo);
    setMessages(stored?.messages ?? []);
    setStyleState(stored?.style ?? 'normal');
    setStreamingMessage('');
    setToolEvents([]);
    setStatus(null);
    setIsResponding(false);
    setHydrated(true);
  }, [owner, repo, explanation, defaultBranch]);

  useEffect(() => {
    if (!explanation || !hydrated) return;
    saveStoredRepoState(createUpdatedRepoState(owner, repo, explanation, defaultBranch, messages, style));
  }, [owner, repo, explanation, defaultBranch, messages, style, hydrated]);

  const cleanup = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close(1000, 'cleanup');
      }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    cleanup();

    const url = `${config.wsUrl}/${owner}/${repo}/chat`;
    setConnectionState('connecting');

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnectionState('open');
      reconnectDelayRef.current = RECONNECT_BASE_MS;

      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data as string);
        switch (data.type) {
          case 'status':
            setStatus({ stage: data.stage, path: data.path });
            break;
          case 'chunk':
            setStatus(null);
            setStreamingMessage((prev) => prev + (data.delta ?? ''));
            break;
          case 'tool_call':
            setToolEvents((prev) => [
              ...prev,
              {
                id: `${Date.now()}-${prev.length}`,
                tool: data.tool ?? 'unknown',
                path: data.path ?? '',
              },
            ]);
            break;
          case 'result':
            setStatus(null);
            setStreamingMessage('');
            setIsResponding(false);
            setMessages((prev) => {
              const toolMessages = toolEventsRef.current.map((event) => ({
                role: 'tool' as const,
                content:
                  event.tool === 'read_file'
                    ? `Read ${event.path}`
                    : event.tool === 'list_directory'
                      ? `Listed ${event.path}`
                      : `${event.tool}: ${event.path}`,
                timestamp: new Date().toISOString(),
              }));

              return [
                ...prev,
                ...toolMessages,
                {
                  role: 'assistant',
                  content: data.message,
                  timestamp: new Date().toISOString(),
                },
              ];
            });
            setToolEvents([]);
            break;
          case 'error':
            setStatus(null);
            setStreamingMessage('');
            setIsResponding(false);
            setMessages((prev) => {
              const toolMessages = toolEventsRef.current.map((event) => ({
                role: 'tool' as const,
                content:
                  event.tool === 'read_file'
                    ? `Read ${event.path}`
                    : event.tool === 'list_directory'
                      ? `Listed ${event.path}`
                      : `${event.tool}: ${event.path}`,
                timestamp: new Date().toISOString(),
              }));

              return [
                ...prev,
                ...toolMessages,
                {
                  role: 'assistant',
                  content: `**Error:** ${data.detail || 'Something went wrong.'}`,
                  timestamp: new Date().toISOString(),
                },
              ];
            });
            setToolEvents([]);
            break;
          case 'pong':
            break;
          default:
            break;
        }
      } catch {
        // Ignore malformed messages.
      }
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      setConnectionState('closed');
      setStatus(null);
      setIsResponding(false);

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      if (event.code !== 1000) {
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_MS);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      // onclose handles reconnect.
    };
  }, [owner, repo, cleanup]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [connect, cleanup]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !explanation) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      const outboundHistory = toOutboundHistory(messagesRef.current);

      setMessages((prev) => [
        ...prev,
        { role: 'user', content: trimmed, timestamp: new Date().toISOString() },
      ]);
      setStreamingMessage('');
      setToolEvents([]);
      setStatus({ stage: 'thinking' });
      setIsResponding(true);

      wsRef.current.send(
        JSON.stringify({
          type: 'message',
          content: trimmed,
          history: outboundHistory,
          explanation,
          style: styleRef.current,
        }),
      );
    },
    [explanation],
  );

  const setStyle = useCallback((nextStyle: ChatStyle) => {
    styleRef.current = nextStyle;
    setStyleState(nextStyle);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingMessage('');
    setToolEvents([]);
    setStatus(null);
    setIsResponding(false);
  }, []);

  return {
    messages,
    streamingMessage,
    toolEvents,
    status,
    isResponding,
    connectionState,
    style,
    sendMessage,
    setStyle,
    clearMessages,
  };
}
