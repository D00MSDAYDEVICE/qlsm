import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AdminRow from '../AdminRow';

const row = (over = {}) => ({ steamId: '76561198012345678', level: 3, ...over });

describe('AdminRow', () => {
  it('shows the operator name when known', () => {
    render(<AdminRow row={row()} operator={{ name: 'Vex' }} />);
    expect(screen.getByText('Vex')).toBeInTheDocument();
  });

  it('shows the SteamID as the label when unknown, with an add action', () => {
    render(<AdminRow row={row()} operator={null} onAddToDirectory={vi.fn()} />);
    expect(screen.getByText('76561198012345678')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to operators/i })).toBeInTheDocument();
  });

  it('has no Adopt button and no state badge', () => {
    render(<AdminRow row={row()} onRemove={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /adopt/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/managed|not applied|set in-game|revoked/i)).not.toBeInTheDocument();
  });

  it('removes on click, and not while disabled', async () => {
    const onRemove = vi.fn();
    const { rerender } = render(<AdminRow row={row()} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole('button', { name: /remove admin/i }));
    expect(onRemove).toHaveBeenCalledWith('76561198012345678');
    rerender(<AdminRow row={row()} onRemove={onRemove} disabled />);
    expect(screen.getByRole('button', { name: /remove admin/i })).toBeDisabled();
  });

  it('shows the name and SteamID on the row, but not the level (the card header has it)', () => {
    render(<AdminRow row={row()} operator={{ name: 'Vex' }} />);
    const rowEl = screen.getByTestId('admin-row-76561198012345678');
    expect(rowEl).toHaveTextContent('Vex');
    expect(rowEl).toHaveTextContent('76561198012345678');
    expect(rowEl).not.toHaveTextContent(/lvl/);
  });

  it('shows the SteamID only once when there is no name', () => {
    render(<AdminRow row={row()} operator={null} />);
    expect(screen.getAllByText('76561198012345678')).toHaveLength(1);
  });

  it('shows the in-game name with the SteamID when not in the directory', () => {
    render(<AdminRow row={row({ inGameName: '^1ST^701C' })} operator={null} onAddToDirectory={vi.fn()} />);
    const rowEl = screen.getByTestId('admin-row-76561198012345678');
    expect(rowEl).toHaveTextContent('ST01C');
    expect(rowEl).not.toHaveTextContent('^1');
    expect(screen.getByText('76561198012345678')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to operators/i })).toBeInTheDocument();
  });

  it('prefers the operator name over the in-game name', () => {
    render(<AdminRow row={row({ inGameName: 'Other' })} operator={{ name: 'Vex' }} />);
    expect(screen.getByText('Vex')).toBeInTheDocument();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
  });
});
