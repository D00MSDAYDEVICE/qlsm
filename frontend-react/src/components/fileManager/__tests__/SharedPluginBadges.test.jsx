import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SharedPluginBadges from '../SharedPluginBadges';

const item = { name: 'afkplus.py', path: 'afkplus.py', type: 'file', shared: true };

describe('SharedPluginBadges', () => {
  it('renders nothing for a non-shared row', () => {
    const { container } = render(<SharedPluginBadges item={{ ...item, shared: false }} missingOnHost={new Set(['afkplus.py'])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the shared badge when the host has the file', () => {
    render(<SharedPluginBadges item={item} missingOnHost={new Set()} onPushToHost={vi.fn()} />);
    expect(screen.getByTestId('plugin-shared-afkplus.py')).toHaveTextContent(/shared/i);
    expect(screen.queryByTestId('plugin-missing-afkplus.py')).not.toBeInTheDocument();
    expect(screen.queryByTestId('plugin-push-afkplus.py')).not.toBeInTheDocument();
  });

  it('shows the not-on-host badge and push button when the host is missing the file', () => {
    const onPushToHost = vi.fn();
    render(<SharedPluginBadges item={item} missingOnHost={new Set(['afkplus.py'])} onPushToHost={onPushToHost} />);
    expect(screen.getByTestId('plugin-missing-afkplus.py')).toHaveTextContent(/not on host/i);
    expect(screen.queryByTestId('plugin-shared-afkplus.py')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('plugin-push-afkplus.py'));
    expect(onPushToHost).toHaveBeenCalledTimes(1);
  });

  it('disables the push button while a push is running', () => {
    render(<SharedPluginBadges item={item} missingOnHost={new Set(['afkplus.py'])} onPushToHost={vi.fn()} pushingToHost />);
    expect(screen.getByTestId('plugin-push-afkplus.py')).toBeDisabled();
  });

  it('hides the push button when no push handler is wired', () => {
    render(<SharedPluginBadges item={item} missingOnHost={new Set(['afkplus.py'])} />);
    expect(screen.getByTestId('plugin-missing-afkplus.py')).toBeInTheDocument();
    expect(screen.queryByTestId('plugin-push-afkplus.py')).not.toBeInTheDocument();
  });
});
