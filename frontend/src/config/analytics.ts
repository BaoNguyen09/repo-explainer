/**
 * PostHog analytics
 * No-op when VITE_POSTHOG_KEY is unset, mirroring the backend's posthog_client pattern.
 */
import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: true,
    autocapture: true,
  });
}

/** Capture a custom event. No-op if PostHog is disabled. Never pass message text or user content. */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (!POSTHOG_KEY) return;
  posthog.capture(event, properties);
}
