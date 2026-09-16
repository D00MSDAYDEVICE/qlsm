// Width of the FileManager file-list sidebar, shared by every mounted
// FileManager rather than owned per-instance.
//
// The Config / Plugins / Factories tabs all keep their FileManager mounted and
// toggle visibility with a `hidden` class (see EditInstanceConfigModal and
// AddInstanceForm), so three sidebars are alive at once. A plain useState in
// each one would let a drag on Plugins leave the already-mounted Config and
// Factories sidebars at their old width until the modal was reopened. A
// module-level store read through useSyncExternalStore re-renders all of them
// on the same drag; localStorage behind it carries the width across reloads.

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'qlsm.fileManager.sidebarWidth';

export const DEFAULT_SIDEBAR_WIDTH = 320;
export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 560;

function clampWidth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(numeric)));
}

// Storage can throw (private mode, blocked site data) and can hold junk left by
// an older build — either way fall back to the default rather than break the tab.
function readStoredWidth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_SIDEBAR_WIDTH;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_SIDEBAR_WIDTH;
    return clampWidth(parsed);
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

let currentWidth = null;
const listeners = new Set();

export function getSidebarWidth() {
  if (currentWidth === null) currentWidth = readStoredWidth();
  return currentWidth;
}

export function setSidebarWidth(next) {
  const clamped = clampWidth(next);
  if (clamped === getSidebarWidth()) return;
  currentWidth = clamped;
  try {
    localStorage.setItem(STORAGE_KEY, String(clamped));
  } catch {
    // Width still applies for this session; it just won't survive a reload.
  }
  listeners.forEach(listener => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSidebarWidth() {
  return useSyncExternalStore(subscribe, getSidebarWidth, () => DEFAULT_SIDEBAR_WIDTH);
}
