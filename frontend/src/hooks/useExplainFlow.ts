import { useCallback, useRef, useState } from 'react';
import { parseGitHubUrl } from '../utils/parseGitHubUrl';
import type { FormResult } from '../types';
import { config } from '../config/api';
import { track, getDistinctId } from '../config/analytics';
import { loadStoredRepoState, saveRepoOverview } from '../utils/repoStorage';

const STAGE_MESSAGES: Record<string, string> = {
  validating: 'Validating repository...',
  fetching_tree: 'Fetching directory structure...',
  exploring_files: 'AI is exploring which files to read...',
  fetching_files: 'Fetching file contents...',
  generating_explanation: 'Generating explanation...',
};

/** Stage keys in the order the backend emits them, used to drive step-indicator UIs. */
export const EXPLAIN_STAGE_ORDER = [
  'validating',
  'fetching_tree',
  'exploring_files',
  'fetching_files',
  'generating_explanation',
] as const;

export function getMessageForStage(stage: string): string {
  return STAGE_MESSAGES[stage] ?? stage;
}

export interface ParsedRepo {
  owner: string;
  repo: string;
}

interface SubmitOptions {
  /** Force a fresh regeneration even if a cached overview exists (no instructions given). */
  forceRegenerate?: boolean;
}

export interface UseExplainFlowReturn {
  isLoading: boolean;
  resultData: FormResult | null;
  isStoredOverview: boolean;
  error: string | null;
  statusMessage: string | null;
  completedSteps: string[];
  /** Raw stage key of the in-flight SSE stage (e.g. "fetching_tree"), null when idle or before the first event. */
  currentStage: string | null;
  parsedRepo: ParsedRepo | null;
  notifyEnabled: boolean;
  notifySupported: boolean;
  submit: (query: string, instructions: string, options?: SubmitOptions) => void;
  regenerate: () => void;
  /** Aborts an in-flight SSE stream. No-op if nothing is loading. */
  cancel: () => void;
  reset: () => void;
  enableNotifications: () => void;
}

/**
 * Shared explain flow: parses a repo URL, resolves from localStorage cache when possible,
 * otherwise opens an SSE stream against the backend and tracks stage progress, elapsed
 * notifications, and analytics. Used by both the desktop InputForm and the mobile screens
 * so the SSE/notification/cache logic lives in exactly one place.
 */
export function useExplainFlow(): UseExplainFlowReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [resultData, setResultData] = useState<FormResult | null>(null);
  const [isStoredOverview, setIsStoredOverview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [parsedRepo, setParsedRepo] = useState<ParsedRepo | null>(null);
  const [notifyEnabled, setNotifyEnabled] = useState(false);

  const gotResultRef = useRef(false);
  const failureTrackedRef = useRef(false);
  const lastSubmitRef = useRef<{ query: string; instructions: string } | null>(null);
  const esRef = useRef<EventSource | null>(null);
  // Ref mirror of notifyEnabled so the SSE handlers (captured at submit time) always
  // see the latest opt-in state, even if the user enables notifications mid-request.
  const notifyEnabledRef = useRef(false);

  const notifySupported = 'Notification' in window && Notification.permission !== 'denied';

  // Permission must be requested from a user gesture (the button click) — Chrome
  // silently blocks/auto-dismisses prompts triggered any other way.
  const enableNotifications = useCallback(() => {
    if (!('Notification' in window) || Notification.permission === 'denied') return;
    Notification.requestPermission().then((permission) => {
      if (permission !== 'granted') return;
      notifyEnabledRef.current = true;
      setNotifyEnabled(true);
      setParsedRepo((current) => {
        if (current) {
          track('notification_opt_in', {
            owner: current.owner,
            repo: current.repo,
            repo_full: `${current.owner}/${current.repo}`,
          });
        }
        return current;
      });
    });
  }, []);

  // Only notify if the user opted in and has actually tabbed away — a visible tab
  // already shows the result, so a notification there would just be noise.
  const notifyIfHidden = (title: string) => {
    if (!notifyEnabledRef.current || document.visibilityState !== 'hidden') return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const notification = new Notification(title);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  };

  const submit = useCallback((query: string, instructions: string, options: SubmitOptions = {}) => {
    setError(null);
    setStatusMessage(null);
    setCompletedSteps([]);
    setCurrentStage(null);
    gotResultRef.current = false;
    failureTrackedRef.current = false;
    lastSubmitRef.current = { query, instructions };

    if (!query || !query.trim()) {
      setError('Please enter a GitHub repository URL');
      setIsLoading(false);
      return;
    }

    const parsed = parseGitHubUrl(query);
    if (!parsed) {
      setError('Invalid GitHub URL format. Please use: https://github.com/owner/repo or owner/repo');
      setIsLoading(false);
      return;
    }

    setParsedRepo({ owner: parsed.owner, repo: parsed.repo });
    track('repo_submitted', {
      owner: parsed.owner,
      repo: parsed.repo,
      repo_full: `${parsed.owner}/${parsed.repo}`,
    });

    const instructionsTrimmed = instructions?.trim() || '';

    if (!instructionsTrimmed && !options.forceRegenerate) {
      const stored = loadStoredRepoState(parsed.owner, parsed.repo);
      if (stored) {
        setResultData({
          explanation: stored.explanation,
          repo: stored.repo,
          timestamp: stored.updatedAt,
          cache: true,
          default_branch: stored.defaultBranch,
          suggested_questions: stored.suggestedQuestions,
        });
        setIsStoredOverview(true);
        setIsLoading(false);
        track('explanation_viewed_from_cache', {
          owner: parsed.owner,
          repo: parsed.repo,
          repo_full: `${parsed.owner}/${parsed.repo}`,
        });
        return;
      }
    }

    setIsLoading(true);
    setResultData(null);
    setIsStoredOverview(false);
    // EventSource cannot set headers, so identity travels as a query param.
    const streamParams = new URLSearchParams();
    if (instructionsTrimmed) {
      streamParams.set('instructions', instructionsTrimmed);
    }
    const distinctId = getDistinctId();
    if (distinctId) {
      streamParams.set('distinct_id', distinctId);
    }
    const queryString = streamParams.toString();
    const url = `${config.apiUrl}/${parsed.owner}/${parsed.repo}/stream${queryString ? `?${queryString}` : ''}`;

    const es = new EventSource(url);
    esRef.current = es;

    // A native connection error fires both the 'error' listener and es.onerror,
    // so guard against capturing explanation_failed twice for one submission.
    const trackFailure = (source: string, detail?: string) => {
      if (failureTrackedRef.current) return;
      failureTrackedRef.current = true;
      track('explanation_failed', {
        owner: parsed.owner,
        repo: parsed.repo,
        repo_full: `${parsed.owner}/${parsed.repo}`,
        source,
        detail: detail ? detail.slice(0, 200) : undefined,
      });
    };

    es.addEventListener('status', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { stage?: string };
        const stage = data?.stage;
        if (stage) {
          const msg = getMessageForStage(stage);
          setCompletedSteps((prev) =>
            prev[prev.length - 1] === msg ? prev : [...prev, msg]
          );
          setStatusMessage(msg);
          setCurrentStage(stage);
        }
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener('result', (event: MessageEvent) => {
      gotResultRef.current = true;
      try {
        const data = JSON.parse(event.data as string) as FormResult;
        setResultData(data);
        setIsStoredOverview(false);
        saveRepoOverview(data);
        track('explanation_rendered', {
          owner: parsed.owner,
          repo: parsed.repo,
          repo_full: `${parsed.owner}/${parsed.repo}`,
        });
        notifyIfHidden('Your repo explanation is ready ✅');
      } catch {
        setError('Invalid response from server');
        trackFailure('invalid_response');
        notifyIfHidden('Your repo explanation failed ❌');
      }
      es.close();
      esRef.current = null;
      setIsLoading(false);
      setStatusMessage(null);
      setCompletedSteps([]);
      setCurrentStage(null);
    });

    es.addEventListener('error', (event: MessageEvent) => {
      try {
        if (event.data) {
          const data = JSON.parse(event.data as string) as { detail?: string };
          if (data?.detail) {
            setError(data.detail);
            trackFailure('server_error', data.detail);
          }
        }
      } catch {
        setError('Connection lost or server error');
        trackFailure('server_error');
      }
      notifyIfHidden('Your repo explanation failed ❌');
      es.close();
      esRef.current = null;
      setIsLoading(false);
      setStatusMessage(null);
      setCompletedSteps([]);
      setCurrentStage(null);
    });

    es.onerror = () => {
      if (!gotResultRef.current) {
        setError((prev) => prev || 'Connection lost or server error');
        trackFailure('connection_lost');
        notifyIfHidden('Your repo explanation failed ❌');
      }
      es.close();
      esRef.current = null;
      setIsLoading(false);
      setStatusMessage(null);
      setCompletedSteps([]);
      setCurrentStage(null);
    };
  }, []);

  const regenerate = useCallback(() => {
    if (isLoading || !lastSubmitRef.current) return;
    const { query, instructions } = lastSubmitRef.current;
    submit(query, instructions, { forceRegenerate: true });
  }, [isLoading, submit]);

  const cancel = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setIsLoading(false);
    setStatusMessage(null);
    setCompletedSteps([]);
    setCurrentStage(null);
  }, []);

  const reset = useCallback(() => {
    setIsLoading(false);
    setResultData(null);
    setIsStoredOverview(false);
    setError(null);
    setStatusMessage(null);
    setCompletedSteps([]);
    setCurrentStage(null);
    setParsedRepo(null);
  }, []);

  return {
    isLoading,
    resultData,
    isStoredOverview,
    error,
    statusMessage,
    completedSteps,
    currentStage,
    parsedRepo,
    notifyEnabled,
    notifySupported,
    submit,
    regenerate,
    cancel,
    reset,
    enableNotifications,
  };
}
