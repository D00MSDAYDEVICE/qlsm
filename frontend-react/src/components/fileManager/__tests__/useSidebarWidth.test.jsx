import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The store caches the width in a module-level variable, so any test that needs
// a *fresh* read of localStorage re-imports the module rather than resetting it
// through a test-only export.
async function freshModule() {
  vi.resetModules();
  return import('../useSidebarWidth');
}

function Probe({ useSidebarWidth, label }) {
  const width = useSidebarWidth();
  return <span data-testid={label}>{width}</span>;
}

describe('useSidebarWidth store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to 320 when nothing is stored', async () => {
    const { getSidebarWidth, DEFAULT_SIDEBAR_WIDTH } = await freshModule();
    expect(DEFAULT_SIDEBAR_WIDTH).toBe(320);
    expect(getSidebarWidth()).toBe(320);
  });

  it('clamps below the minimum and above the maximum', async () => {
    const { getSidebarWidth, setSidebarWidth } = await freshModule();

    setSidebarWidth(40);
    expect(getSidebarWidth()).toBe(200);

    setSidebarWidth(9000);
    expect(getSidebarWidth()).toBe(560);
  });

  it('rounds fractional drag positions to whole pixels', async () => {
    const { getSidebarWidth, setSidebarWidth } = await freshModule();
    setSidebarWidth(321.6);
    expect(getSidebarWidth()).toBe(322);
  });

  it('persists the width and reads it back on a fresh mount', async () => {
    const first = await freshModule();
    first.setSidebarWidth(410);
    expect(localStorage.getItem('qlsm.fileManager.sidebarWidth')).toBe('410');

    const second = await freshModule();
    expect(second.getSidebarWidth()).toBe(410);
  });

  it('falls back to the default when storage holds junk', async () => {
    localStorage.setItem('qlsm.fileManager.sidebarWidth', 'not-a-number');
    const { getSidebarWidth } = await freshModule();
    expect(getSidebarWidth()).toBe(320);
  });

  it('clamps an out-of-range stored value instead of trusting it', async () => {
    localStorage.setItem('qlsm.fileManager.sidebarWidth', '5000');
    const { getSidebarWidth } = await freshModule();
    expect(getSidebarWidth()).toBe(560);
  });

  it('survives localStorage throwing', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const { getSidebarWidth, setSidebarWidth } = await freshModule();
    expect(getSidebarWidth()).toBe(320);
    expect(() => setSidebarWidth(400)).not.toThrow();
    expect(getSidebarWidth()).toBe(400);

    getItem.mockRestore();
    setItem.mockRestore();
  });

  // The Config / Plugins / Factories tabs keep all three FileManagers mounted,
  // so a drag on one has to move the other two immediately.
  it('keeps every mounted consumer in sync through one setSidebarWidth', async () => {
    const { useSidebarWidth, setSidebarWidth } = await freshModule();

    render(
      <>
        <Probe useSidebarWidth={useSidebarWidth} label="config" />
        <Probe useSidebarWidth={useSidebarWidth} label="plugins" />
        <Probe useSidebarWidth={useSidebarWidth} label="factories" />
      </>
    );

    expect(screen.getByTestId('config')).toHaveTextContent('320');

    act(() => setSidebarWidth(450));

    expect(screen.getByTestId('config')).toHaveTextContent('450');
    expect(screen.getByTestId('plugins')).toHaveTextContent('450');
    expect(screen.getByTestId('factories')).toHaveTextContent('450');
  });
});
