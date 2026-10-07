import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../api', () => ({ default: { get: mocks.get } }));

import { waitForRestart } from '../system';

const info = (bootId) => ({ data: { data: { restart_supported: true, boot_id: bootId } } });

describe('waitForRestart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.get.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps waiting while the process being replaced still answers', async () => {
    // The old worker serves for a moment after the restart request; treating
    // its answer as "back" reloads the page onto code without the new addons.
    mocks.get
      .mockResolvedValueOnce(info('old'))
      .mockResolvedValueOnce(info('old'))
      .mockResolvedValue(info('new'));

    let settled;
    waitForRestart('old').then((v) => { settled = v; });

    await vi.advanceTimersByTimeAsync(2000);
    expect(settled).toBeUndefined();

    await vi.advanceTimersByTimeAsync(2000);
    expect(settled).toBe(true);
  });

  it('retries a failed or timed-out poll, each poll bounded by its own timeout', async () => {
    // A request that falls in the gap between the old worker going away and
    // the new one coming up may never be answered. Bounding it is what lets
    // the loop move on instead of hanging on "Restarting..." forever.
    mocks.get
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }))
      .mockResolvedValue(info('new'));

    const result = waitForRestart('old', { requestTimeoutMs: 4000 });
    await vi.advanceTimersByTimeAsync(2000);

    await expect(result).resolves.toBe(true);
    for (const [, config] of mocks.get.mock.calls) {
      expect(config).toEqual({ timeout: 4000 });
    }
  });

  it('gives up at the deadline when no new process ever answers', async () => {
    mocks.get.mockResolvedValue(info('old'));

    const result = waitForRestart('old', { timeoutMs: 10000 });
    await vi.advanceTimersByTimeAsync(12000);

    await expect(result).resolves.toBe(false);
  });
});
