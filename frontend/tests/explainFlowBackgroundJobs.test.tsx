import { beforeEach, expect, test } from 'bun:test';

/** Stands in for the browser EventSource so tests can drive SSE events by hand. */
class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];

  closed = false;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    super();
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }

  static reset() {
    FakeEventSource.instances = [];
  }

  static get latest() {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1];
  }
}

(globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;

let notificationPermission: NotificationPermission = 'default';
(globalThis as unknown as { Notification: unknown }).Notification = class {
  static get permission() {
    return notificationPermission;
  }
  static requestPermission() {
    return Promise.resolve(notificationPermission);
  }
};

const { useExplainFlow } = await import('../src/hooks/useExplainFlow');
const { loadStoredRepoState } = await import('../src/utils/repoStorage');
const { listPendingJobs, savePendingJob } = await import('../src/utils/pendingJobs');
const { createRoot } = await import('react-dom/client');
const { act, useEffect } = await import('react');

type Flow = ReturnType<typeof useExplainFlow>;

async function mountFlow() {
  const latest: { current: Flow | null } = { current: null };

  function Harness() {
    const flow = useExplainFlow();
    useEffect(() => {
      latest.current = flow;
    });
    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<Harness />);
  });

  return {
    flow: () => latest.current!,
    unmount: () => {
      root.unmount();
      container.remove();
    },
  };
}

const RESULT_PAYLOAD = {
  explanation: 'This repo does things.',
  repo: 'octocat/Hello-World',
  timestamp: '2026-08-01T10:00:00.000Z',
  cache: false,
  default_branch: 'main',
  suggested_questions: ['What is the entry point?'],
};

beforeEach(() => {
  localStorage.clear();
  FakeEventSource.reset();
  notificationPermission = 'default';
});

test('a job left running by a previous page load is resumed, not restarted', async () => {
  savePendingJob('octocat', 'Hello-World', '');

  const harness = await mountFlow();

  expect(FakeEventSource.instances).toHaveLength(1);
  expect(FakeEventSource.latest.url).toContain('/octocat/Hello-World/stream');
  expect(FakeEventSource.latest.url).toContain('resume=1');
  expect(harness.flow().isLoading).toBe(true);
  expect(harness.flow().parsedRepo).toMatchObject({ owner: 'octocat', repo: 'Hello-World' });

  harness.unmount();
});

test('a resumed job that finishes delivers its result to the screen', async () => {
  savePendingJob('octocat', 'Hello-World', '');
  const harness = await mountFlow();

  await act(async () => {
    FakeEventSource.latest.emit('result', RESULT_PAYLOAD);
  });

  expect(harness.flow().resultData?.explanation).toBe('This repo does things.');
  expect(harness.flow().isLoading).toBe(false);
  // The record is gone, so the next load doesn't reconnect to finished work.
  expect(listPendingJobs()).toEqual([]);

  harness.unmount();
});

test('older pending jobs are followed in the background while the newest owns the screen', async () => {
  savePendingJob('facebook', 'react', '');
  await new Promise((resolve) => setTimeout(resolve, 5));
  savePendingJob('octocat', 'Hello-World', '');

  const harness = await mountFlow();

  expect(FakeEventSource.instances).toHaveLength(2);
  expect(harness.flow().parsedRepo).toMatchObject({ repo: 'Hello-World' });

  const background = FakeEventSource.instances.find((es) => es.url.includes('/facebook/react/'))!;
  await act(async () => {
    background.emit('result', { ...RESULT_PAYLOAD, repo: 'facebook/react' });
  });

  // Cached for later, but it never hijacks the screen from the repo in front.
  expect(loadStoredRepoState('facebook', 'react')?.explanation).toBe('This repo does things.');
  expect(harness.flow().resultData).toBeNull();

  harness.unmount();
});

test('starting a new repo mid-run leaves the first one running instead of aborting it', async () => {
  const harness = await mountFlow();

  await act(async () => {
    harness.flow().submit('https://github.com/octocat/Hello-World', '');
  });
  const first = FakeEventSource.latest;
  expect(harness.flow().isLoading).toBe(true);

  await act(async () => {
    harness.flow().runInBackground();
  });

  expect(first.closed).toBe(false);
  expect(harness.flow().isLoading).toBe(false);

  await act(async () => {
    harness.flow().submit('https://github.com/facebook/react', '');
  });
  expect(FakeEventSource.latest.url).toContain('/facebook/react/stream');
  expect(first.closed).toBe(false);

  // The backgrounded run still completes and lands in the cache.
  await act(async () => {
    first.emit('result', RESULT_PAYLOAD);
  });
  expect(loadStoredRepoState('octocat', 'Hello-World')?.explanation).toBe('This repo does things.');
  expect(harness.flow().parsedRepo).toMatchObject({ repo: 'react' });

  harness.unmount();
});

test('cancelling stops watching and drops the record so nothing is resumed later', async () => {
  const harness = await mountFlow();

  await act(async () => {
    harness.flow().submit('https://github.com/octocat/Hello-World', '');
  });
  const stream = FakeEventSource.latest;
  expect(listPendingJobs()).toHaveLength(1);

  await act(async () => {
    harness.flow().cancel();
  });

  expect(stream.closed).toBe(true);
  expect(harness.flow().isLoading).toBe(false);
  expect(listPendingJobs()).toEqual([]);

  harness.unmount();
});

test('an already-granted notification permission is reflected without asking again', async () => {
  notificationPermission = 'granted';
  const harness = await mountFlow();

  expect(harness.flow().notifyEnabled).toBe(true);
  expect(harness.flow().notifySupported).toBe(true);

  harness.unmount();
});

test('notifications start off when permission has never been asked for', async () => {
  const harness = await mountFlow();
  expect(harness.flow().notifyEnabled).toBe(false);
  harness.unmount();
});

test('a denied permission is reported as unsupported rather than as a live prompt', async () => {
  notificationPermission = 'denied';
  const harness = await mountFlow();

  expect(harness.flow().notifySupported).toBe(false);
  expect(harness.flow().notifyEnabled).toBe(false);

  harness.unmount();
});

test('submitting the repo already being watched does not open a second stream', async () => {
  const harness = await mountFlow();

  await act(async () => {
    harness.flow().submit('https://github.com/octocat/Hello-World', '');
  });
  await act(async () => {
    harness.flow().submit('https://github.com/octocat/Hello-World', '');
  });

  expect(FakeEventSource.instances).toHaveLength(1);

  harness.unmount();
});
