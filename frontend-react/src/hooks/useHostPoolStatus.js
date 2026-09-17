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

  const refresh = useCallback(async () => {
    if (!hostId) return new Set();
    try {
      const response = await checkPluginUpdates(hostId);
      const changes = response?.data?.common_pool_changes || [];
      const next = new Set(changes.filter(c => c.change === 'added').map(c => c.name));
      setMissing(next);
      setState('ready');
      return next;
    } catch {
      setMissing(new Set());
      setState('unavailable');
      return null;
    }
  }, [hostId]);

  useEffect(() => {
    if (!enabled || !hostId) return undefined;
    let cancelled = false;
    setState('checking');
    (async () => {
      const result = await refresh();
      if (cancelled) return;
      if (result === null) setState('unavailable');
    })();
    return () => { cancelled = true; };
  }, [enabled, hostId, refresh]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current.interval);
      clearTimeout(pollRef.current.timeout);
      pollRef.current = null;
    }
    setPushing(false);
  }, []);

  useEffect(() => () => {
    if (pollRef.current) {
      clearInterval(pollRef.current.interval);
      clearTimeout(pollRef.current.timeout);
    }
  }, []);

  const push = useCallback(async () => {
    if (!hostId || pushing) return;
    const wanted = new Set(missing);
    try {
      await applyPluginUpdates(hostId, { update_common_pool: true, instances: {}, restart_instances: [] });
    } catch (err) {
      showError?.(err?.error?.message || err?.message || 'Failed to push the plugin pool to the host.');
      return;
    }
    setPushing(true);
    const interval = setInterval(async () => {
      const next = await refresh();
      if (next === null) return; // transient check failure: keep polling until timeout
      const stillMissing = [...wanted].some(name => next.has(name));
      if (!stillMissing) stopPolling();
    }, POOL_POLL_INTERVAL_MS);
    const timeout = setTimeout(stopPolling, POOL_POLL_TIMEOUT_MS);
    pollRef.current = { interval, timeout };
  }, [hostId, pushing, missing, refresh, showError, stopPolling]);

  return { missing, state, pushing, push, refresh };
}
