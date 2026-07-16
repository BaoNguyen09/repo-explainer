import { expect, test } from 'bun:test';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });

/**
 * Proves the specific syntax patterns called out in prompts.py's MERMAID
 * SYNTAX RULES actually break (or don't break) the real mermaid parser under
 * this app's config — so the prompt hardening targets real failure modes,
 * not assumptions from a blog post.
 */

test('a well-formed diagram following the rules renders successfully', async () => {
  const result = await mermaid.render('rules-valid', 'flowchart TD\n  A["Frontend"] --> B["Backend"]');
  expect(result.svg).toContain('<svg');
});

test('a reserved word ("end") used as a bare node ID breaks the parser', async () => {
  await expect(
    mermaid.render('rules-reserved', 'flowchart TD\n  end[Done] --> A["Start"]'),
  ).rejects.toThrow();
});

test('unquoted parentheses in a node label break the parser', async () => {
  await expect(
    mermaid.render('rules-parens', 'flowchart TD\n  A[Frontend (React + Vite)] --> B[Backend]'),
  ).rejects.toThrow();
});

test('quoting the same label (per the rule) fixes it', async () => {
  const result = await mermaid.render(
    'rules-parens-fixed',
    'flowchart TD\n  A["Frontend (React + Vite)"] --> B["Backend"]',
  );
  expect(result.svg).toContain('<svg');
});

test('an unterminated bracket breaks the parser', async () => {
  await expect(
    mermaid.render('rules-unterminated', 'flowchart TD\n  A[Unterminated --> B["Fine"]'),
  ).rejects.toThrow();
});
