import { expect, test } from 'bun:test';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useMermaidRender } from '../src/hooks/useMermaidRender';

type RenderState = ReturnType<typeof useMermaidRender>;

function Harness({
  code,
  diagramId,
  onState,
}: {
  code: string;
  diagramId: string;
  onState: (state: RenderState) => void;
}) {
  onState(useMermaidRender(code, diagramId));
  return null;
}

/** Mounts the hook via a real React tree (using the real `mermaid` package,
 * not a mock) and waits for it to settle into either a rendered or error state. */
async function renderHarness(code: string, diagramId: string): Promise<RenderState> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: RenderState = { svgContent: '', isRendered: false, error: null };

  await act(async () => {
    root.render(<Harness code={code} diagramId={diagramId} onState={(state) => { latest = state; }} />);
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  root.unmount();
  container.remove();
  return latest;
}

test('invalid mermaid syntax surfaces as a distinct error, not a fake success', async () => {
  const state = await renderHarness('this is not a mermaid diagram at all !!!', 'bad-diagram');

  // The bug this guards: the old code stuffed the error into svgContent and
  // marked isRendered=true, so every consumer showed the broken markup inside
  // the full pan/zoom/export UI instead of a clean error state.
  expect(state.error).not.toBeNull();
  expect(state.isRendered).toBe(false);
  expect(state.svgContent).toBe('');
});
