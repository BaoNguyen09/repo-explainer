/**
 * API configuration
 * Uses environment variables to switch between development and production
 */

const API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://127.0.0.1:8000';

export const config = {
  apiUrl: API_URL,
} as const;

