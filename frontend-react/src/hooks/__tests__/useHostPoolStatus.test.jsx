import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useHostPoolStatus } from '../useHostPoolStatus';

const checkPluginUpdates = vi.fn();
const applyPluginUpdates = vi.fn();
vi.mock('../../services/api', () => ({
  checkPluginUpdates: (...a) => checkPluginUpdates(...a),
  applyPluginUpdates: (...a) => applyPluginUpdates(...a),
}));

function check(changes) {
  return { data: { common_pool_changes: changes, common_pool_error: null, instances: [] } };
}

describe('useHostPoolStatus', () => {
  const showError = vi.fn();
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('stays idle until enabled and keeps only "added" pool files', async () => {
    checkPluginUpdates.mockResolvedValue(check([
      { name: 'afkplus.py', change: 'added' },
      { name: 'balance.py', change: 'modified' },
    ]));
    const { result, rerender } = renderHook(
      ({ enabled }) => useHostPoolStatus(5, { enabled, showError }),
      { initialProps: { enabled: false } },
    );
    expect(result.current.state).toBe('idle');
    expect(checkPluginUpdates).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(checkPluginUpdates).toHaveBeenCalledWith(5);
    expect([...result.current.missing]).toEqual(['afkplus.py']);
  });

  it('is unavailable when the check fails', async () => {
    checkPluginUpdates.mockRejectedValue({ error: { message: 'Host must be in ACTIVE state' } });
    const { result } = renderHook(() => useHostPoolStatus(5, { enabled: true, showError }));
    await waitFor(() => expect(result.current.state).toBe('unavailable'));
    expect(result.current.missing.size).toBe(0);
    expect(showError).not.toHaveBeenCalled();
  });

  it('does nothing without a host id', () => {
    const { result } = renderHook(() => useHostPoolStatus(null, { enabled: true, showError }));
    expect(result.current.state).toBe('idle');
    expect(checkPluginUpdates).not.toHaveBeenCalled();
  });

  it('push applies the common pool and polls until the file is on the host', async () => {
    vi.useFakeTimers();
    checkPluginUpdates
      .mockResolvedValueOnce(check([{ name: 'afkplus.py', change: 'added' }]))
      .mockResolvedValueOnce(check([{ name: 'afkplus.py', change: 'added' }]))
      .mockResolvedValueOnce(check([]));
    applyPluginUpdates.mockResolvedValue({ message: 'Plugin update process initiated.' });

    const { result } = renderHook(() => useHostPoolStatus(5, { enabled: true, showError }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.missing.has('afkplus.py')).toBe(true);

    await act(async () => { await result.current.push(); });
    expect(applyPluginUpdates).toHaveBeenCalledWith(5, { update_common_pool: true, instances: {}, restart_instances: [] });
    expect(result.current.pushing).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.pushing).toBe(true);           // second check still lists it
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.pushing).toBe(false);          // third check: gone
    expect(result.current.missing.size).toBe(0);
  });

  it('push stops polling after the timeout', async () => {
    vi.useFakeTimers();
    checkPluginUpdates.mockResolvedValue(check([{ name: 'afkplus.py', change: 'added' }]));
    applyPluginUpdates.mockResolvedValue({});
    const { result } = renderHook(() => useHostPoolStatus(5, { enabled: true, showError }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await result.current.push(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(95000); });
    expect(result.current.pushing).toBe(false);
    expect(result.current.missing.has('afkplus.py')).toBe(true);
  });

  it('does not update state after unmount when a poll tick is still in flight', async () => {
    vi.useFakeTimers();
    checkPluginUpdates.mockResolvedValueOnce(check([{ name: 'afkplus.py', change: 'added' }]));
    applyPluginUpdates.mockResolvedValue({});

    const { result, unmount } = renderHook(() => useHostPoolStatus(5, { enabled: true, showError }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await result.current.push(); });

    let resolvePoll;
    checkPluginUpdates.mockImplementationOnce(() => new Promise((resolve) => { resolvePoll = resolve; }));
    const callsBeforeUnmount = checkPluginUpdates.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(checkPluginUpdates.mock.calls.length).toBe(callsBeforeUnmount + 1);

    unmount();

    // Resolve the in-flight poll tick's request after unmount, and let any
    // continuation run; it must not call setState (React would warn) or
    // schedule another poll.
    await act(async () => {
      resolvePoll(check([]));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(checkPluginUpdates.mock.calls.length).toBe(callsBeforeUnmount + 1);
  });

  it('push surfaces a server error and does not start polling', async () => {
    checkPluginUpdates.mockResolvedValue(check([{ name: 'afkplus.py', change: 'added' }]));
    applyPluginUpdates.mockRejectedValue({ error: { message: 'Another operation is running on host "x".' } });
    const { result } = renderHook(() => useHostPoolStatus(5, { enabled: true, showError }));
    await waitFor(() => expect(result.current.state).toBe('ready'));
    await act(async () => { await result.current.push(); });
    expect(showError).toHaveBeenCalledWith('Another operation is running on host "x".');
    expect(result.current.pushing).toBe(false);
  });
});
