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

  it('ignores a check that comes back after the host changed', async () => {
    let resolveSlowHost;
    checkPluginUpdates.mockImplementationOnce(() => new Promise((resolve) => { resolveSlowHost = resolve; }));
    checkPluginUpdates.mockResolvedValue(check([{ name: 'host7.py', change: 'added' }]));

    const { result, rerender } = renderHook(
      ({ id }) => useHostPoolStatus(id, { enabled: true, showError }),
      { initialProps: { id: 5 } },
    );
    rerender({ id: 7 });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect([...result.current.missing]).toEqual(['host7.py']);

    // Host 5's check finally answers; it belongs to a host we left.
    await act(async () => { resolveSlowHost(check([{ name: 'host5.py', change: 'added' }])); });
    expect([...result.current.missing]).toEqual(['host7.py']);
    expect(result.current.state).toBe('ready');
  });

  it('clears the previous host badges as soon as a new check starts', async () => {
    checkPluginUpdates.mockResolvedValueOnce(check([{ name: 'host5.py', change: 'added' }]));
    const { result, rerender } = renderHook(
      ({ id }) => useHostPoolStatus(id, { enabled: true, showError }),
      { initialProps: { id: 5 } },
    );
    await waitFor(() => expect([...result.current.missing]).toEqual(['host5.py']));

    checkPluginUpdates.mockImplementationOnce(() => new Promise(() => {}));
    rerender({ id: 7 });
    expect(result.current.state).toBe('checking');
    expect(result.current.missing.size).toBe(0);
  });

  it('keeps the badges while the same host is re-checked', async () => {
    checkPluginUpdates.mockResolvedValueOnce(check([{ name: 'host5.py', change: 'added' }]));
    const { result, rerender } = renderHook(
      ({ enabled }) => useHostPoolStatus(5, { enabled, showError }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect([...result.current.missing]).toEqual(['host5.py']));

    // Leaving and re-entering the Plugins tab re-checks the same host.
    rerender({ enabled: false });
    checkPluginUpdates.mockImplementationOnce(() => new Promise(() => {}));
    rerender({ enabled: true });
    expect(result.current.state).toBe('checking');
    expect([...result.current.missing]).toEqual(['host5.py']);
  });

  it('stops a running push poll when the host changes', async () => {
    vi.useFakeTimers();
    checkPluginUpdates.mockResolvedValue(check([{ name: 'afkplus.py', change: 'added' }]));
    applyPluginUpdates.mockResolvedValue({});

    const { result, rerender } = renderHook(
      ({ id }) => useHostPoolStatus(id, { enabled: true, showError }),
      { initialProps: { id: 5 } },
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await result.current.push(); });
    expect(result.current.pushing).toBe(true);

    await act(async () => { rerender({ id: 7 }); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.pushing).toBe(false);

    const callsAfterSwitch = checkPluginUpdates.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(checkPluginUpdates.mock.calls.length).toBe(callsAfterSwitch);
  });

  it('never runs two checks at once: the next tick waits for the previous one', async () => {
    vi.useFakeTimers();
    checkPluginUpdates.mockResolvedValueOnce(check([{ name: 'afkplus.py', change: 'added' }]));
    applyPluginUpdates.mockResolvedValue({});
    const { result } = renderHook(() => useHostPoolStatus(5, { enabled: true, showError }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await result.current.push(); });

    let resolveSlowCheck;
    checkPluginUpdates.mockImplementationOnce(() => new Promise((resolve) => { resolveSlowCheck = resolve; }));
    const before = checkPluginUpdates.mock.calls.length;

    // Six interval lengths against a host that has not answered once.
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(checkPluginUpdates.mock.calls.length).toBe(before + 1);

    checkPluginUpdates.mockResolvedValue(check([]));
    await act(async () => {
      resolveSlowCheck(check([{ name: 'afkplus.py', change: 'added' }]));
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.pushing).toBe(false);
  });

  it('is unavailable when the host answers 200 with a common pool error', async () => {
    checkPluginUpdates.mockResolvedValue({
      data: { common_pool_changes: [], common_pool_error: 'SSH connection failed', instances: [] },
    });
    const { result } = renderHook(() => useHostPoolStatus(5, { enabled: true, showError }));
    await waitFor(() => expect(result.current.state).toBe('unavailable'));
    expect(result.current.missing.size).toBe(0);
    expect(showError).not.toHaveBeenCalled();
  });

  it('a common pool error mid-poll is not a finished push', async () => {
    vi.useFakeTimers();
    checkPluginUpdates
      .mockResolvedValueOnce(check([{ name: 'afkplus.py', change: 'added' }]))
      .mockResolvedValue({
        data: { common_pool_changes: [], common_pool_error: 'SSH connection failed', instances: [] },
      });
    applyPluginUpdates.mockResolvedValue({});

    const { result } = renderHook(() => useHostPoolStatus(5, { enabled: true, showError }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await result.current.push(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.pushing).toBe(true);
    expect(result.current.state).toBe('unavailable');
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(result.current.pushing).toBe(true);

    // It ends at the 90 s deadline, not on the first unreadable check.
    await act(async () => { await vi.advanceTimersByTimeAsync(70000); });
    expect(result.current.pushing).toBe(false);
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
