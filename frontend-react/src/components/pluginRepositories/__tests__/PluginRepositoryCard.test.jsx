import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import PluginRepositoryCard from '../PluginRepositoryCard';

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('../../NotificationProvider', () => ({
  useNotification: () => ({ showSuccess, showError }),
}));

const downloadPluginRepositoryPlugins = vi.fn();
vi.mock('../../../services/api', () => ({
  downloadPluginRepositoryPlugins: (...args) => downloadPluginRepositoryPlugins(...args),
}));

const repo = {
  id: 7,
  name: 'Repo',
  url: 'https://example.com',
  last_synced_at: null,
  plugins: [{ filename: 'afkplus.py', label: 'AFK Plus', runtime: 'minqlx' }],
};

async function downloadAfkplus() {
  render(<PluginRepositoryCard repo={repo} onSync={vi.fn()} onDelete={vi.fn()} syncing={false} />);
  fireEvent.click(screen.getByRole('button', { name: /1 plugin/i }));
  fireEvent.click(screen.getByRole('checkbox', { name: /afk plus|afkplus/i }));
  fireEvent.click(screen.getByRole('button', { name: /^download/i }));
  await waitFor(() => expect(downloadPluginRepositoryPlugins).toHaveBeenCalled());
}

describe('PluginRepositoryCard download feedback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('names the hosts the pool is being pushed to', async () => {
    downloadPluginRepositoryPlugins.mockResolvedValue({
      downloaded: ['afkplus.py'], errors: [],
      push: { queued: [{ id: 1, name: 'alpha' }, { id: 2, name: 'beta' }], skipped: [] },
    });
    await downloadAfkplus();
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Downloaded 1 plugin(s). Pushing to alpha, beta.'));
    expect(showError).not.toHaveBeenCalled();
  });

  it('says so when no active host could take the push', async () => {
    downloadPluginRepositoryPlugins.mockResolvedValue({
      downloaded: ['afkplus.py'], errors: [], push: { queued: [], skipped: [] },
    });
    await downloadAfkplus();
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Downloaded 1 plugin(s). No active host to push to.'));
  });

  it('warns about skipped hosts with their reason', async () => {
    downloadPluginRepositoryPlugins.mockResolvedValue({
      downloaded: ['afkplus.py'], errors: [],
      push: { queued: [{ id: 1, name: 'alpha' }], skipped: [{ id: 2, name: 'beta', reason: 'busy' }] },
    });
    await downloadAfkplus();
    await waitFor(() => expect(showError).toHaveBeenCalledWith(
      'Not pushed to beta (busy). Run Check for Updates on those hosts later.',
    ));
  });
});
