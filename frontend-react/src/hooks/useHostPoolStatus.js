import { useCallback, useEffect, useRef, useState } from 'react';
import { applyPluginUpdates, checkPluginUpdates } from '../services/api';

export const POOL_POLL_INTERVAL_MS = 5000;
export const POOL_POLL_TIMEOUT_MS = 90000;

// Which shared-pool plugins the host's common pool doesn't hold yet. Reuses
// the Check for Updates diff (GET /hosts/<id>/plugin-updates): an "added"
// common-pool entry is a file in QLSM's pool that is missing on the host,
// which is exactly the case where enabling it would fail to load.
export function useHostPoolStatus(hostId, { enabled = false, showError } = {}) {
  const [missing, setMissing] = useState(() => new Set());
  const [state, setState] = useState('idle');
  const [pushing, setPushing] = useState(false);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);
  // Every refresh() takes the next generation and only writes state if it is
  // still the newest one for the host it was started for. A check runs a
  // synchronous SSH command and can take seconds, so switching hosts mid-check
  // is an ordinary thing to do, and the old host's answer must not land on the
  // new host's view.
  const genRef = useRef(0);
  const hostRef = useRef(hostId);
  hostRef.current = hostId;
  const checkedHostRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!hostId) return new Set();
    const gen = ++genRef.current;
    const isCurrent = () => mountedRef.current && genRef.current === gen && hostRef.current === hostId;
    try {
      const response = await checkPluginUpdates(hostId);
      // An ACTIVE host that can't be reached over SSH still answers 200, with
      // common_pool_error set and no changes. That means "unknown", not
      // "nothing is missing" -- reporting it as ready would clear the badges
      // and, mid-push, read as a completed push.
      if (response?.data?.common_pool_error) {
        if (isCurrent()) {
          setMissing(new Set());
          setState('unavailable');
        }
        return null;
      }
      const changes = response?.data?.common_pool_changes || [];
      const next = new Set(changes.filter(c => c.change === 'added').map(c => c.name));
      if (!isCurrent()) return next;
      setMissing(next);
      setState('ready');
      return next;
    } catch {
      if (!isCurrent()) return null;
      setMissing(new Set());
      setState('unavailable');
      return null;
    }
  }, [hostId]);

  useEffect(() => {
    if (!enabled || !hostId) return undefined;
    setState('checking');
    // Another host's badges don't describe this one, so drop them at the start
    // of the check instead of rendering them over the new host for its whole
    // duration. Re-checking the same host keeps them: they're still the best
    // answer we have, and the alternative is a flash of no badges every time
    // the Plugins tab is opened.
    if (checkedHostRef.current !== hostId) {
      checkedHostRef.current = hostId;
      setMissing(new Set());
    }
    refresh();
    return undefined;
  }, [enabled, hostId, refresh]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current.tick);
      clearTimeout(pollRef.current.deadline);
      pollRef.current = null;
    }
    if (mountedRef.current) setPushing(false);
  }, []);

  // A poll belongs to the host it was started for, so a host change cancels it
  // instead of letting it overwrite the new host's state every 5 s. Runs on
  // unmount too, which clears the timers.
  useEffect(() => () => stopPolling(), [hostId, stopPolling]);

  const push = useCallback(async () => {
    if (!hostId || pushing) return;
    const wanted = new Set(missing);
    const pushHostId = hostId;
    try {
      await applyPluginUpdates(hostId, { update_common_pool: true, instances: {}, restart_instances: [] });
    } catch (err) {
      if (mountedRef.current) {
        showError?.(err?.error?.message || err?.message || 'Failed to push the plugin pool to the host.');
      }
      return;
    }
    if (!mountedRef.current) return;
    setPushing(true);
    // Self-scheduling chain rather than setInterval: the next check is only
    // queued once the previous one has come back. Each check is a blocking SSH
    // call on the server, and the push is exactly when the host is busy, so a
    // fixed interval would stack requests against a slow host.
    const tick = async () => {
      const next = await refresh();
      if (!pollRef.current || !mountedRef.current || hostRef.current !== pushHostId) return;
      // next === null is a check we couldn't read (host unreachable, transient
      // failure): keep polling until the deadline rather than calling it done.
      if (next !== null && ![...wanted].some(name => next.has(name))) {
        stopPolling();
        return;
      }
      pollRef.current.tick = setTimeout(tick, POOL_POLL_INTERVAL_MS);
    };
    pollRef.current = {
      tick: setTimeout(tick, POOL_POLL_INTERVAL_MS),
      deadline: setTimeout(stopPolling, POOL_POLL_TIMEOUT_MS),
    };
  }, [hostId, pushing, missing, refresh, showError, stopPolling]);

  return { missing, state, pushing, push, refresh };
}
