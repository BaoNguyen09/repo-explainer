import { describe, expect, test } from 'bun:test';

import { getWaitMessage } from '../src/utils/waitMessage';

describe('getWaitMessage', () => {
  test('shows the initial connecting message before ~4s', () => {
    expect(getWaitMessage(0)).toBe('Connecting...');
    expect(getWaitMessage(3)).toBe('Connecting...');
  });

  test('escalates to the cold-start explanation from ~4s to ~75s', () => {
    expect(getWaitMessage(4)).toContain('Waking up the server');
    expect(getWaitMessage(74)).toContain('Waking up the server');
  });

  test('escalates to the still-working message after ~75s', () => {
    expect(getWaitMessage(75)).toContain('Still working');
    expect(getWaitMessage(200)).toContain('Still working');
  });
});
