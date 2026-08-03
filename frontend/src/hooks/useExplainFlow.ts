import { useCallback, useEffect, useRef, useState } from 'react';
import { parseGitHubUrl } from '../utils/parseGitHubUrl';
import type { FormResult } from '../types';
import { config } from '../config/api';
import { track, getDistinctId } from '../config/analytics';
import { loadStoredRepoState, saveRepoOverview } from '../utils/repoStorage';
import { clearPendingJob, listPendingJobs, savePendingJob } from '../utils/pendingJobs';
import { prefetchSuggestedQuestions } from './useSuggestedQuestions';

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

interface StreamOptions {
  /** Reconnect to a job the client believes is already running server-side. */
  resume?: boolean;
  /** Follow the job for its side effects only (cache + notification), not for the UI. */
  background?: boolean;
}

/** Per-stream state. One of these exists per EventSource, so a backgrounded run
 *  and a newly submitted one can't clobber each other's flags. */
interface StreamHandle {
  detached: boolean;
  gotResult: boolean;
  failureTracked: boolean;
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
  /** Leaves the current job running (result still cached + notified) and frees the UI
   *  so another repo can be explained. No-op if nothing is loading. */
  runInBackground: () => void;
  reset: () => void;
  enableNotifications: () => void;
}

function permissionGranted(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

/**
 * Shared explain flow: parses a repo URL, resolves from localStorage cache when possible,
 * otherwise opens an SSE stream against the backend and tracks stage progress, elapsed
 * notifications, and analytics. Used by both the desktop InputForm and the mobile screens
 * so the SSE/notification/cache logic lives in exactly one place.
 *
 * Explain jobs live on the server (see backend/job_registry.py), so a stream here is a
 * *view* onto a job rather than the job itself: closing it doesn't stop the work. That's
 * what makes reloading mid-run cheap (reconnect and keep watching) and what lets the user
 * start a second repo without throwing the first one away.
 */
export function useExplainFlow(): UseExplainFlowReturn {
  // Read once, at mount: the most recent job a previous page load left running
  // on the server. Used as the *initial* state rather than applied from an
  // effect so the very first render already shows the loading screen for it.
  const [resuming] = useState(() => listPendingJobs()[0]);

  const [isLoading, setIsLoading] = useState(Boolean(resuming));
  const [resultData, setResultData] = useState<FormResult | null>(null);
  const [isStoredOverview, setIsStoredOverview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [parsedRepo, setParsedRepo] = useState<ParsedRepo | null>(
    resuming ? { owner: resuming.owner, repo: resuming.repo } : null
  );
  // Seeded from the live permission rather than starting at false: the grant is
  // per-origin and permanent, so a user who already opted in should never be
  // asked again on the next repo (or the next visit).
  const [notifyEnabled, setNotifyEnabled] = useState(permissionGranted);

  const lastSubmitRef = useRef<{ query: string; instructions: string } | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const streamHandleRef = useRef<StreamHandle | null>(null);
  // What the foreground stream is currently working on, so a duplicate submit for
  // the same repo joins it instead of opening a second view onto the same job.
  const activeRequestRef = useRef<{ owner: string; repo: string; instructions: string } | null>(null);
  // Ref mirror of notifyEnabled so the SSE handlers (captured at submit time) always
  // see the latest opt-in state, even if the user enables notifications mid-request.
  const notifyEnabledRef = useRef(permissionGranted());

  const notifySupported = 'Notification' in window && Notification.permission !== 'denied';

  // Permission must be requested from a user gesture (the button click) — Chrome
  // silently blocks/auto-dismisses prompts triggered any other way.
  const enableNotifications = useCallback(() => {
    if (!('Notification' in window) || Notification.permission === 'denied') return;
    if (Notification.permission === 'granted') {
      notifyEnabledRef.current = true;
      setNotifyEnabled(true);
      return;
    }
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

  const startStream = useCallback(
    (parsed: ParsedRepo, instructions: string, options: StreamOptions = {}) => {
      const handle: StreamHandle = {
        detached: Boolean(options.background),
        gotResult: false,
        failureTracked: false,
      };

      // EventSource cannot set headers, so identity travels as a query param.
      const streamParams = new URLSearchParams();
      if (instructions) {
        streamParams.set('instructions', instructions);
      }
      const distinctId = getDistinctId();
      if (distinctId) {
        streamParams.set('distinct_id', distinctId);
      }
      if (options.resume) {
        streamParams.set('resume', '1');
      }
      const queryString = streamParams.toString();
      const url = `${config.apiUrl}/${parsed.owner}/${parsed.repo}/stream${queryString ? `?${queryString}` : ''}`;

      const es = new EventSource(url);
      savePendingJob(parsed.owner, parsed.repo, instructions);

      if (!handle.detached) {
        esRef.current = es;
        streamHandleRef.current = handle;
        activeRequestRef.current = { owner: parsed.owner, repo: parsed.repo, instructions };
      }

      // Every setState goes through here so a stream that has been pushed to the
      // background stops driving the screen while still finishing its work.
      const ui = (update: () => void) => {
        if (!handle.detached) update();
      };

      // Only notify if the user opted in, and only when they aren't already looking at
      // the answer: a visible tab showing this very repo needs no notification, but a
      // backgrounded job finishing while they read another repo does.
      const notifyDone = (title: string) => {
        if (!notifyEnabledRef.current) return;
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        if (!shouldNotify(handle.detached)) return;
        const notification = new Notification(title);
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      };

      /**
       * Stop watching this stream.
       *
       * `jobFinished` is deliberately separate from "the connection ended".
       * They were the same thing when the connection *was* the job, but a job
       * now outlives its connection: a transport failure means the run is very
       * likely still going, which is exactly the case the pending record exists
       * to remember. Clearing it there would delete the only pointer back to
       * work still being paid for, and the next load would start it over.
       */
      const finishStream = (jobFinished: boolean) => {
        es.close();
        if (jobFinished) {
          clearPendingJob(parsed.owner, parsed.repo, instructions);
        }
        if (esRef.current === es) {
          esRef.current = null;
          streamHandleRef.current = null;
          activeRequestRef.current = null;
        }
        ui(() => {
          setIsLoading(false);
          setStatusMessage(null);
          setCompletedSteps([]);
          setCurrentStage(null);
        });
      };

      // A native connection error fires both the 'error' listener and es.onerror,
      // so guard against capturing explanation_failed twice for one submission.
      const trackFailure = (source: string, detail?: string) => {
        if (handle.failureTracked) return;
        handle.failureTracked = true;
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
            ui(() => {
              setCompletedSteps((prev) =>
                prev[prev.length - 1] === msg ? prev : [...prev, msg]
              );
              setStatusMessage(msg);
              setCurrentStage(stage);
            });
          }
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener('result', (event: MessageEvent) => {
        handle.gotResult = true;
        try {
          const data = JSON.parse(event.data as string) as FormResult;
          // Saved before any UI check so a backgrounded or unwatched run still
          // lands in the cache — that's what makes it instant to open later.
          saveRepoOverview(data);
          ui(() => {
            setResultData(data);
            setIsStoredOverview(false);
          });
          if (!data.suggested_questions?.length) {
            prefetchSuggestedQuestions(parsed.owner, parsed.repo, data.explanation);
          }
          track('explanation_rendered', {
            owner: parsed.owner,
            repo: parsed.repo,
            repo_full: `${parsed.owner}/${parsed.repo}`,
          });
          notifyDone(`${parsed.owner}/${parsed.repo} explanation is ready ✅`);
        } catch {
          ui(() => setError('Invalid response from server'));
          trackFailure('invalid_response');
          notifyDone(`${parsed.owner}/${parsed.repo} explanation failed ❌`);
        }
        finishStream(true);
      });

      es.addEventListener('error', (event: MessageEvent) => {
        // This listener fires for two unrelated things: a server-sent
        // `event: error` frame, which carries data and means the job really
        // failed, and a native transport error, which carries none and says
        // nothing about whether the job is still running.
        const serverSent = Boolean(event.data);
        try {
          if (event.data) {
            const data = JSON.parse(event.data as string) as { detail?: string };
            if (data?.detail) {
              ui(() => setError(data.detail!));
              trackFailure('server_error', data.detail);
            }
          }
        } catch {
          ui(() => setError('Connection lost or server error'));
          trackFailure('server_error');
        }
        notifyDone(`${parsed.owner}/${parsed.repo} explanation failed ❌`);
        finishStream(serverSent);
      });

      es.onerror = () => {
        if (!handle.gotResult) {
          ui(() => setError((prev) => prev || 'Connection lost or server error'));
          trackFailure('connection_lost');
          notifyDone(`${parsed.owner}/${parsed.repo} explanation failed ❌`);
        }
        // Transport-level only: the job is presumed to still be running, so the
        // pending record survives and the next load reconnects to it.
        finishStream(handle.gotResult);
      };
    },
    []
  );

  /** Detach the foreground stream from the UI without stopping it. */
  const runInBackground = useCallback(() => {
    if (streamHandleRef.current) {
      streamHandleRef.current.detached = true;
    }
    esRef.current = null;
    streamHandleRef.current = null;
    activeRequestRef.current = null;
    setIsLoading(false);
    setStatusMessage(null);
    setCompletedSteps([]);
    setCurrentStage(null);
    setParsedRepo(null);
  }, []);

  const submit = useCallback((query: string, instructions: string, options: SubmitOptions = {}) => {
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

    const instructionsTrimmed = instructions?.trim() || '';

    // Already watching exactly this request (e.g. a deep link re-submitting a job
    // we resumed on mount) — joining again would just duplicate the connection.
    const active = activeRequestRef.current;
    if (
      active &&
      active.owner === parsed.owner &&
      active.repo === parsed.repo &&
      active.instructions === instructionsTrimmed
    ) {
      return;
    }

    setError(null);
    setStatusMessage(null);
    setCompletedSteps([]);
    setCurrentStage(null);
    lastSubmitRef.current = { query, instructions };

    // Submitting a different repo mid-run pushes the current one to the background
    // rather than aborting it; its result still gets cached and notified.
    if (esRef.current) {
      runInBackground();
    }

    setParsedRepo({ owner: parsed.owner, repo: parsed.repo });
    track('repo_submitted', {
      owner: parsed.owner,
      repo: parsed.repo,
      repo_full: `${parsed.owner}/${parsed.repo}`,
    });

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

    // An identical job may already be running server-side from a previous visit;
    // resume lets a finished-but-unseen one hand over its result immediately.
    const pending = listPendingJobs().some(
      (job) =>
        job.owner === parsed.owner &&
        job.repo === parsed.repo &&
        job.instructions === instructionsTrimmed
    );
    startStream(
      { owner: parsed.owner, repo: parsed.repo },
      instructionsTrimmed,
      { resume: pending && !options.forceRegenerate }
    );
  }, [runInBackground, startStream]);

  // Re-attach to the newest job only — the repo the user was watching when they
  // reloaded. Older records are left alone on purpose: the backend restarts a
  // job it can't find, so auto-reconnecting to a stale record would silently
  // begin a full paid run that nobody is waiting for. Anything still genuinely
  // running is reachable by submitting that repo again, which resumes it.
  // The state this needs was set above, so the effect only opens the connection.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current || !resuming) return;
    resumedRef.current = true;

    const newest = resuming;
    lastSubmitRef.current = {
      query: `https://github.com/${newest.owner}/${newest.repo}`,
      instructions: newest.instructions,
    };
    track('explanation_resumed', {
      owner: newest.owner,
      repo: newest.repo,
      repo_full: `${newest.owner}/${newest.repo}`,
    });
    startStream({ owner: newest.owner, repo: newest.repo }, newest.instructions, { resume: true });
  }, [resuming, startStream]);

  const regenerate = useCallback(() => {
    if (isLoading || !lastSubmitRef.current) return;
    const { query, instructions } = lastSubmitRef.current;
    submit(query, instructions, { forceRegenerate: true });
  }, [isLoading, submit]);

  const cancel = useCallback(() => {
    const parsed = parsedRepo;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    streamHandleRef.current = null;
    const active = activeRequestRef.current;
    if (active) {
      clearPendingJob(active.owner, active.repo, active.instructions);
    } else if (parsed) {
      clearPendingJob(parsed.owner, parsed.repo, '');
    }
    activeRequestRef.current = null;
    setIsLoading(false);
    setStatusMessage(null);
    setCompletedSteps([]);
    setCurrentStage(null);
  }, [parsedRepo]);

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
    runInBackground,
    reset,
    enableNotifications,
  };
}

/**
 * Whether a finished job should raise a desktop notification.
 *
 * `isBackground` is true when the user pushed this job aside to explain a
 * different repo, and false when it's the run they're actively watching.
 */
function shouldNotify(isBackground: boolean): boolean {
  void isBackground; // currently ignored by the rule below
  // TODO(human)
  return document.visibilityState === 'hidden';
}
