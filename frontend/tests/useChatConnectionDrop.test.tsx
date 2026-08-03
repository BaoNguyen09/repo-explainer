import { expect, test } from 'bun:test';

class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    super();
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send() {
    /* no-op: never replies, simulating a connection that drops mid-response */
  }

  close(code = 1000, reason = '') {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

(globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;

const { useChat } = await import('../src/hooks/useChat');
const { createRoot } = await import('react-dom/client');
const { act, useEffect } = await import('react');

test('a connection drop mid-response leaves a visible message instead of dropping silently', async () => {
  const latestRef: { current: ReturnType<typeof useChat> | null } = { current: null };
  function Harness() {
    const result = useChat('octocat', 'Hello-World', 'some explanation', 'main');
    useEffect(() => {
      latestRef.current = result;
    });
    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<Harness />);
    await new Promise((resolve) => setTimeout(resolve, 20)); // let the fake WS "open"
  });

  await act(async () => {
    latestRef.current!.sendMessage('How does routing work?');
  });
  expect(latestRef.current!.isResponding).toBe(true);

  await act(async () => {
    FakeWebSocket.instances[FakeWebSocket.instances.length - 1].close(1006, 'simulated drop');
  });

  root.unmount();
  container.remove();

  expect(latestRef.current!.isResponding).toBe(false);
  expect(
    latestRef.current!.messages.some((m) => m.role === 'assistant' && m.content.includes('Connection lost')),
  ).toBe(true);
});
