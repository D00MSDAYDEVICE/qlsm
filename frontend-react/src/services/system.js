// qlsm's own process-level API (/api/system/...), as opposed to the game
// servers it manages. Kept beside services/addons.js for the same reason:
// one small URL prefix, and api.js is already large.
import apiClient from './api';

export const getSystemInfo = async ({ timeout } = {}) => {
  const response = await apiClient.get('/system/info', { timeout });
  return response.data.data;
};

export const requestRestart = async () => {
  const response = await apiClient.post('/system/restart');
  return response.data;
};

/**
 * Resolve once a NEW qlsm process answers after a restart.
 *
 * `previousBootId` is /system/info's boot_id read before the restart was
 * requested. Any answer is not proof: the worker being replaced keeps
 * answering for a moment, so only a different boot_id means the new process
 * (and the addons it loaded) is serving.
 *
 * Every poll has its own timeout. gunicorn can drop the old worker before the
 * new one is up, and a request caught in that gap may never be answered;
 * without a timeout the loop would wait on it forever and never reach its
 * deadline.
 */
export const waitForRestart = async (previousBootId, {
  timeoutMs = 120000,
  intervalMs = 2000,
  requestTimeoutMs = 4000,
} = {}) => {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const info = await getSystemInfo({ timeout: requestTimeoutMs });
      if (info?.boot_id && info.boot_id !== previousBootId) {
        return true;
      }
    } catch {
      // Down, mid-swap, or timed out: expected while restarting.
    }
    await sleep(intervalMs);
  }
  return false;
};
