/**
 * Staged wait messaging shown while waiting for the first SSE event.
 * The backend runs on a free tier that sleeps when idle, so a cold start
 * can take 30-60s with no events at all — escalate the message over time
 * so the UI never looks frozen.
 */
export function getWaitMessage(elapsedSeconds: number): string {
  if (elapsedSeconds >= 75) {
    return 'Still working - hang tight, this is longer than usual.';
  }
  if (elapsedSeconds >= 4) {
    return 'Waking up the server. Usually ready in under a minute.';
  }
  return 'Connecting...';
}
