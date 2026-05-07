/**
 * API configuration
 * Uses environment variables to switch between development and production
 */

const API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://127.0.0.1:8000';

function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, 'ws');
}

export const config = {
  apiUrl: API_URL,
  wsUrl: toWsUrl(API_URL),
} as const;

