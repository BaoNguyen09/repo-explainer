import { describe, expect, test } from 'bun:test';

import { toOutboundHistory } from '../src/hooks/useChat';
import type { ChatMessage } from '../src/types';

describe('toOutboundHistory', () => {
  test('filters UI-only tool messages before sending history to the backend', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Where is startup?', timestamp: '2026-04-28T00:00:00.000Z' },
      { role: 'tool', content: 'Read backend/main.py', timestamp: '2026-04-28T00:00:01.000Z' },
      { role: 'assistant', content: 'Startup is in backend/main.py.', timestamp: '2026-04-28T00:00:02.000Z' },
    ];

    expect(toOutboundHistory(messages)).toEqual([
      { role: 'user', content: 'Where is startup?' },
      { role: 'assistant', content: 'Startup is in backend/main.py.' },
    ]);
  });
});
