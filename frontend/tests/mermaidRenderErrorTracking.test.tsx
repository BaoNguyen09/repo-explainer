import { expect, mock, test } from 'bun:test';

const trackCalls: Array<[string, Record<string, unknown> | undefined]> = [];

mock.module('../src/config/analytics', () => ({
  track: (event: string, properties?: Record<string, unknown>) => {
    trackCalls.push([event, properties]);
  },
  getDistinctId: () => null,
}));

const { useMermaidRender } = await import('../src/hooks/useMermaidRender');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

function Harness({ code, diagramId }: { code: string; diagramId: string }) {
  useMermaidRender(code, diagramId);
  return null;
}

test('a mermaid render failure is tracked with a truncated snippet, not full user content', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<Harness code="this is not a mermaid diagram at all !!!" diagramId="tracked-diagram" />);
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  root.unmount();
  container.remove();

  const call = trackCalls.find(([event]) => event === 'mermaid_render_error');
  expect(call).toBeDefined();
  expect(call?.[1]?.diagram_id).toBe('tracked-diagram');
  expect(typeof call?.[1]?.error).toBe('string');
  expect(typeof call?.[1]?.code_snippet).toBe('string');
});
