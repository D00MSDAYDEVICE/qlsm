import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OverwritePluginsModal from '../OverwritePluginsModal';

const mocks = vi.hoisted(() => ({ diffProps: vi.fn() }));

// The diff window has its own test; here we only need to know it was opened
// for the right file.
vi.mock('../PluginDiffModal', () => ({
  default: (props) => {
    mocks.diffProps(props);
    return <div data-testid="diff-modal">{props.filename}</div>;
  },
}));

const REPO = { id: 3, name: 'Doom Repo' };
const FILES = [
  { filename: 'autokick.py', runtime: null },
  { filename: 'motd.py', runtime: 'minqlx' },
];

function renderModal(overrides = {}) {
  const props = { isOpen: true, repo: REPO, files: FILES, onConfirm: vi.fn(), onClose: vi.fn(), ...overrides };
  render(<OverwritePluginsModal {...props} />);
  return props;
}

describe('OverwritePluginsModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists every file ticked and overwrites all of them by default', () => {
    const props = renderModal();

    expect(screen.getByText(/overwrite existing plugins/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'autokick.py' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'motd.py' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /overwrite selected/i }));
    expect(props.onConfirm).toHaveBeenCalledWith(['autokick.py', 'motd.py']);
  });

  it('only overwrites the ticked files', () => {
    const props = renderModal();

    fireEvent.click(screen.getByRole('checkbox', { name: 'autokick.py' }));
    fireEvent.click(screen.getByRole('button', { name: /overwrite selected/i }));

    expect(props.onConfirm).toHaveBeenCalledWith(['motd.py']);
  });

  it('disables overwrite when nothing is ticked', () => {
    renderModal();

    fireEvent.click(screen.getByRole('checkbox', { name: 'autokick.py' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'motd.py' }));

    expect(screen.getByRole('button', { name: /overwrite selected/i })).toBeDisabled();
  });

  it('cancel closes without confirming', () => {
    const props = renderModal();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(props.onClose).toHaveBeenCalled();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('opens the diff for one file with its runtime and keeps the ticks', () => {
    renderModal();

    fireEvent.click(screen.getByRole('checkbox', { name: 'autokick.py' }));
    fireEvent.click(screen.getByRole('button', { name: /diff motd\.py/i }));

    expect(screen.getByTestId('diff-modal')).toHaveTextContent('motd.py');
    expect(mocks.diffProps).toHaveBeenLastCalledWith(expect.objectContaining({
      repo: REPO, filename: 'motd.py', runtime: 'minqlx', isOpen: true,
    }));

    act(() => mocks.diffProps.mock.lastCall[0].onClose());
    expect(screen.queryByTestId('diff-modal')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'autokick.py' })).not.toBeChecked();
  });
});
