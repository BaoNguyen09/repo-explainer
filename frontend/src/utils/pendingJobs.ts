/**
 * Records which explain jobs are believed to still be running on the server.
 *
 * The backend keeps a job alive after its SSE connection drops, but the browser
 * forgets everything on reload — so the fact that a job exists has to survive in
 * localStorage. On the next load these records are what let the app re-attach to
 * work already in progress instead of paying for it a second time.
 */

const PENDING_KEY = 'repo-explainer:pending-jobs';
// Slightly longer than the backend's job TTL: a record that outlives its job
// just causes one harmless reconnect that falls back to a fresh run.
const PENDING_TTL_MS = 20 * 60 * 1000;

export interface PendingJob {
  owner: string;
  repo: string;
  instructions: string;
  startedAt: string;
}

function isPendingJob(value: unknown): value is PendingJob {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PendingJob>;
  return (
    typeof candidate.owner === 'string' &&
    typeof candidate.repo === 'string' &&
    typeof candidate.instructions === 'string' &&
    typeof candidate.startedAt === 'string'
  );
}

function isSameJob(a: PendingJob, owner: string, repo: string, instructions: string): boolean {
  return a.owner === owner && a.repo === repo && a.instructions === instructions;
}

function read(): PendingJob[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(isPendingJob).filter((job) => {
      const age = now - Date.parse(job.startedAt);
      return Number.isFinite(age) && age < PENDING_TTL_MS;
    });
  } catch {
    return [];
  }
}

function write(jobs: PendingJob[]): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(jobs));
  } catch {
    // Storage full or unavailable (private mode): resuming is a nicety, not a
    // requirement, so degrade to the old behaviour rather than breaking submit.
  }
}

/** In-flight jobs, newest first, with expired records dropped. */
export function listPendingJobs(): PendingJob[] {
  const jobs = read();
  return [...jobs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export function savePendingJob(owner: string, repo: string, instructions: string): void {
  const others = read().filter((job) => !isSameJob(job, owner, repo, instructions));
  write([...others, { owner, repo, instructions, startedAt: new Date().toISOString() }]);
}

export function clearPendingJob(owner: string, repo: string, instructions: string): void {
  write(read().filter((job) => !isSameJob(job, owner, repo, instructions)));
}
