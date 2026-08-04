import { beforeEach, expect, test } from 'bun:test';
import { clearPendingJob, listPendingJobs, savePendingJob } from '../src/utils/pendingJobs';

beforeEach(() => {
  localStorage.clear();
});

test('a saved job is listed so the next page load knows to reconnect', () => {
  savePendingJob('octocat', 'Hello-World', '');
  expect(listPendingJobs()).toHaveLength(1);
  expect(listPendingJobs()[0]).toMatchObject({ owner: 'octocat', repo: 'Hello-World' });
});

test('clearing removes only the matching job', () => {
  savePendingJob('octocat', 'Hello-World', '');
  savePendingJob('facebook', 'react', '');
  clearPendingJob('octocat', 'Hello-World', '');

  const remaining = listPendingJobs();
  expect(remaining).toHaveLength(1);
  expect(remaining[0].repo).toBe('react');
});

test('same repo with different instructions is a separate job', () => {
  savePendingJob('octocat', 'Hello-World', '');
  savePendingJob('octocat', 'Hello-World', 'focus on tests');
  expect(listPendingJobs()).toHaveLength(2);

  clearPendingJob('octocat', 'Hello-World', '');
  expect(listPendingJobs()).toHaveLength(1);
  expect(listPendingJobs()[0].instructions).toBe('focus on tests');
});

test('resubmitting the same repo does not duplicate its record', () => {
  savePendingJob('octocat', 'Hello-World', '');
  savePendingJob('octocat', 'Hello-World', '');
  expect(listPendingJobs()).toHaveLength(1);
});

test('jobs are listed newest first so a reload resumes what the user was watching', () => {
  localStorage.setItem(
    'repo-explainer:pending-jobs',
    JSON.stringify([
      { owner: 'a', repo: 'old', instructions: '', startedAt: new Date(Date.now() - 60_000).toISOString() },
      { owner: 'b', repo: 'new', instructions: '', startedAt: new Date().toISOString() },
    ]),
  );
  expect(listPendingJobs().map((job) => job.repo)).toEqual(['new', 'old']);
});

test('records older than the TTL are dropped instead of triggering a pointless reconnect', () => {
  localStorage.setItem(
    'repo-explainer:pending-jobs',
    JSON.stringify([
      { owner: 'a', repo: 'stale', instructions: '', startedAt: new Date(Date.now() - 60 * 60_000).toISOString() },
    ]),
  );
  expect(listPendingJobs()).toEqual([]);
});

test('malformed storage is ignored rather than throwing on load', () => {
  localStorage.setItem('repo-explainer:pending-jobs', 'not json');
  expect(listPendingJobs()).toEqual([]);

  localStorage.setItem('repo-explainer:pending-jobs', JSON.stringify([{ owner: 'a' }, 42]));
  expect(listPendingJobs()).toEqual([]);
});
