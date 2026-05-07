import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { MarkdownRenderer } from '../src/components/MarkdownRenderer';

describe('MarkdownRenderer repo path links', () => {
  test('renders clickable github anchors for linked file paths', () => {
    const html = renderToStaticMarkup(
      <MarkdownRenderer
        content={'Heart = Event Loop (`src/ae.c`). Command logic run (e.g. `src/t_string.c` for SET). Allocator in `deps/`.'}
        owner="redis"
        repo="redis"
        branch="unstable"
      />,
    );

    expect(html).toContain('href="https://github.com/redis/redis/blob/unstable/src/ae.c"');
    expect(html).toContain('href="https://github.com/redis/redis/blob/unstable/src/t_string.c"');
    expect(html).toContain('href="https://github.com/redis/redis/tree/unstable/deps"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('blob/unstable/e.g');
  });
});
