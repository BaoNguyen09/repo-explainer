/** Finds the first ```mermaid fenced code block in markdown, if any. */
export function extractFirstMermaidBlock(markdown: string): string | null {
  const match = /```mermaid\r?\n([\s\S]*?)```/.exec(markdown);
  return match ? match[1].trim() : null;
}
