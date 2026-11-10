import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import PluginDiffModal from '../PluginDiffModal';
import { ThemeProvider } from '../../../context/ThemeContext';

const mocks = vi.hoisted(() => ({ getPluginRepositoryDiff: vi.fn() }));
vi.mock('../../../services/api', () => ({ getPluginRepositoryDiff: mocks.getPluginRepositoryDiff }));

const REPO = { id: 7, name: 'Doom Repo' };

function renderModal() {
  return render(
    <ThemeProvider>
      <PluginDiffModal isOpen onClose={() => {}} repo={REPO} filename="autokick.py" runtime="minqlx" />
    </ThemeProvider>,
  );
}

describe('PluginDiffModal', () => {
  beforeAll(() => {
    // jsdom has no layout; CodeMirror measures ranges.
    const rect = { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) };
    Range.prototype.getBoundingClientRect = () => rect;
    Range.prototype.getClientRects = () => [];
  });

  beforeEach(() => vi.clearAllMocks());

  it('requests the diff and renders both sides in a merge view', async () => {
    mocks.getPluginRepositoryDiff.mockResolvedValue({
      filename: 'autokick.py', runtime: 'minqlx',
      local: 'mode = "kick"\n', remote: 'mode = "warn"\n',
    });

    renderModal();

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.cm-mergeView')).toBeInTheDocument());
    expect(mocks.getPluginRepositoryDiff).toHaveBeenCalledWith(7, 'autokick.py', 'minqlx');
    expect(screen.getByText('On this server')).toBeInTheDocument();
    expect(screen.getByText('From Doom Repo')).toBeInTheDocument();
    expect(document.querySelector('.cm-merge-a .cm-content')).toHaveTextContent('mode = "kick"');
    expect(document.querySelector('.cm-merge-b .cm-content')).toHaveTextContent('mode = "warn"');
  });

  it('says there are no differences when both copies match', async () => {
    mocks.getPluginRepositoryDiff.mockResolvedValue({
      filename: 'autokick.py', runtime: 'minqlx', local: 'same', remote: 'same',
    });

    renderModal();

    expect(await screen.findByText(/no differences/i)).toBeInTheDocument();
    expect(document.querySelector('.cm-mergeView')).not.toBeInTheDocument();
    // The pane captions label nothing here, so they're not shown.
    expect(screen.queryByText('On this server')).not.toBeInTheDocument();
  });

  it('names a line-endings-only difference instead of showing an empty merge view', async () => {
    mocks.getPluginRepositoryDiff.mockResolvedValue({
      filename: 'autokick.py',
      runtime: 'minqlx',
      local: 'import minqlx\nmode = "kick"\n',
      remote: 'import minqlx\r\nmode = "kick"\r\n',
    });

    renderModal();

    expect(await screen.findByText(/differ only in line endings/i)).toBeInTheDocument();
    expect(document.querySelector('.cm-mergeView')).not.toBeInTheDocument();
  });

  it('shows the backend error message', async () => {
    mocks.getPluginRepositoryDiff.mockRejectedValue({ error: { message: 'returned HTTP 404' } });

    renderModal();

    expect(await screen.findByText('returned HTTP 404')).toBeInTheDocument();
  });
});
