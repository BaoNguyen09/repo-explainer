import { describe, expect, test } from 'bun:test';

import { linkifyRepoPaths } from '../src/utils/linkifyRepoPaths';

describe('linkifyRepoPaths', () => {
  test('linkifies repo-relative file paths in plain text', () => {
    const input = 'Heart = Event Loop ( src/ae.c ).';
    const output = linkifyRepoPaths(input, 'redis', 'redis', 'unstable');

    expect(output).toContain('[src/ae.c](https://github.com/redis/redis/blob/unstable/src/ae.c)');
  });

  test('linkifies repo-relative file paths when they appear as inline code', () => {
    const input = 'Heart = Event Loop (`src/ae.c`).';
    const output = linkifyRepoPaths(input, 'redis', 'redis', 'unstable');

    expect(output).toContain('[src/ae.c](https://github.com/redis/redis/blob/unstable/src/ae.c)');
    expect(output).not.toContain('`src/ae.c`');
  });

  test('does not convert prose abbreviations like e.g. into github links', () => {
    const input = 'Command logic run (e.g. `src/t_string.c` for SET).';
    const output = linkifyRepoPaths(input, 'redis', 'redis', 'unstable');

    expect(output).not.toContain('blob/unstable/e.g');
    expect(output).toContain('[src/t_string.c](https://github.com/redis/redis/blob/unstable/src/t_string.c)');
  });

  test('linkifies standalone repo files and dotfiles', () => {
    const input = 'See package.json and .env.example before running.';
    const output = linkifyRepoPaths(input, 'thien', 'repo-explainer', 'main');

    expect(output).toContain('[package.json](https://github.com/thien/repo-explainer/blob/main/package.json)');
    expect(output).toContain('[.env.example](https://github.com/thien/repo-explainer/blob/main/.env.example)');
  });

  test('does not linkify dotted technology names as root files', () => {
    const input = 'The gateway is a Node.js service with React.js UI code.';
    const output = linkifyRepoPaths(input, 'openclaw', 'openclaw', 'main');

    expect(output).toBe(input);
    expect(output).not.toContain('/blob/main/Node.js');
    expect(output).not.toContain('/blob/main/React.js');
  });

  test('linkifies repo-relative directories to github tree urls', () => {
    const input = 'See deps/ and src/core/ before editing.';
    const output = linkifyRepoPaths(input, 'redis', 'redis', 'unstable');

    expect(output).toContain('[deps/](https://github.com/redis/redis/tree/unstable/deps)');
    expect(output).toContain('[src/core/](https://github.com/redis/redis/tree/unstable/src/core)');
  });

  test('linkifies repo-relative directories when they appear as inline code', () => {
    const input = 'Allocator lives in `deps/`. Search logic in `src/core/`.';
    const output = linkifyRepoPaths(input, 'redis', 'redis', 'unstable');

    expect(output).toContain('[deps/](https://github.com/redis/redis/tree/unstable/deps)');
    expect(output).toContain('[src/core/](https://github.com/redis/redis/tree/unstable/src/core)');
    expect(output).not.toContain('`deps/`');
  });

  test('does not rewrite fenced code blocks', () => {
    const input = '```md\nsrc/ae.c\npackage.json\n```';
    const output = linkifyRepoPaths(input, 'redis', 'redis', 'unstable');

    expect(output).toBe(input);
  });

  test('does not double-link existing markdown links', () => {
    const input = 'See [src/ae.c](https://github.com/redis/redis/blob/unstable/src/ae.c).';
    const output = linkifyRepoPaths(input, 'redis', 'redis', 'unstable');

    expect(output).toBe(input);
  });

  test('falls back to HEAD when branch is missing so legacy payloads still link', () => {
    const input = 'Heart = Event Loop (`src/ae.c`).';
    const output = linkifyRepoPaths(input, 'redis', 'redis');

    expect(output).toContain('[src/ae.c](https://github.com/redis/redis/blob/HEAD/src/ae.c)');
  });

  test('uses the generated tree to avoid linking paths that are not in the report', () => {
    const input = [
      'Read `src/ae.c`, `src/missing.c`, and `deps/`.',
      '',
      '```shell',
      'redis/',
      '├── deps/',
      '└── src/',
      '    └── ae.c',
      '```',
    ].join('\n');
    const output = linkifyRepoPaths(input, 'redis', 'redis', 'unstable');

    expect(output).toContain('[src/ae.c](https://github.com/redis/redis/blob/unstable/src/ae.c)');
    expect(output).toContain('[deps/](https://github.com/redis/redis/tree/unstable/deps)');
    expect(output).toContain('`src/missing.c`');
    expect(output).not.toContain('src/missing.c](https://github.com/redis/redis/blob/unstable/src/missing.c)');
  });

  test('uses tree URLs for directories and blob URLs for files from the generated tree', () => {
    const input = [
      'Main UI lives in frontend/src/. Config lives in frontend/package.json.',
      '',
      '```shell',
      'repo-explainer/',
      '└── frontend/',
      '    ├── package.json',
      '    └── src/',
      '```',
    ].join('\n');
    const output = linkifyRepoPaths(input, 'baonguyen09', 'repo-explainer', 'main');

    expect(output).toContain('[frontend/src/](https://github.com/baonguyen09/repo-explainer/tree/main/frontend/src)');
    expect(output).toContain('[frontend/package.json](https://github.com/baonguyen09/repo-explainer/blob/main/frontend/package.json)');
    expect(output).not.toContain('/blob/main/frontend/src');
    expect(output).not.toContain('/tree/main/frontend/package.json');
  });
});
