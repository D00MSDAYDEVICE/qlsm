import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogBackdrop } from '@headlessui/react';
import { Loader2, X } from 'lucide-react';
import { MergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { search, searchKeymap } from '@codemirror/search';
import { python } from '@codemirror/lang-python';
import { getPluginRepositoryDiff } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { mergeThemeExtensions, themeExtensions } from '../../utils/codemirrorSetup';

// Read-only, so no history/autocomplete -- just enough to read and search.
// Order matters for EditorView.theme: CodeMirror mounts theme style modules
// in reverse facet order, so a theme listed EARLIER here wins over one listed
// later for any selector both touch. The editor theme is first on purpose;
// if a merge color ever needs to beat it, move mergeThemeExtensions up.
function sideExtensions(isDark) {
  return [
    lineNumbers(),
    python(),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    // `editable: false` makes the content div contenteditable="false", which
    // is not focusable -- and CodeMirror listens for keydown on that div, so
    // without a tabindex nothing here can ever be focused and searchKeymap
    // never fires (Ctrl-F does nothing). Give each pane a tab stop instead.
    EditorView.contentAttributes.of({ tabindex: '0' }),
    // `top: true` plus the sticky panel styling in mergeThemeExtensions: each
    // pane grows to its full content height inside one shared scroller, so a
    // bottom panel would open thousands of pixels below the fold.
    search({ top: true }),
    keymap.of(searchKeymap),
    ...themeExtensions(isDark),
    ...mergeThemeExtensions(isDark),
  ];
}

const normalizeEol = (text) => (text ?? '').replace(/\r\n?/g, '\n');

// Side-by-side diff of one plugin: this server's pool copy (left) vs. the
// repository's copy (right). Opened from OverwritePluginsModal; the z-index
// keeps it above that prompt.
function PluginDiffModal({ isOpen, onClose, repo, filename, runtime }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [result, setResult] = useState({ status: 'loading' });
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setResult({ status: 'loading' });
    getPluginRepositoryDiff(repo.id, filename, runtime)
      .then((data) => {
        if (!cancelled) setResult({ status: 'ready', local: data.local, remote: data.remote });
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({ status: 'error', message: err?.error?.message || err?.message || 'Failed to load the diff.' });
        }
      });
    return () => { cancelled = true; };
  }, [isOpen, repo.id, filename, runtime]);

  // CodeMirror normalizes CRLF to LF when it builds a document, so two copies
  // that differ only in line endings produce a merge view with no chunks at
  // all -- every line folded into an "N unchanged lines" bar, which reads as a
  // broken diff. Compare the way the panes will, and name that case instead.
  const identical = result.status === 'ready'
    && normalizeEol(result.local) === normalizeEol(result.remote);
  const lineEndingsOnly = identical && result.local !== result.remote;

  useEffect(() => {
    if (result.status !== 'ready' || identical || !containerRef.current) return undefined;
    const view = new MergeView({
      a: { doc: result.local, extensions: sideExtensions(isDark) },
      b: { doc: result.remote, extensions: sideExtensions(isDark) },
      parent: containerRef.current,
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 4 },
    });
    return () => view.destroy();
  }, [result, identical, isDark]);

  return (
    <Dialog open={isOpen} as="div" className="relative z-[80]" onClose={onClose}>
      <DialogBackdrop transition className="modal-backdrop fixed inset-0 transition data-[enter]:ease-out data-[enter]:duration-300 data-[leave]:ease-in data-[leave]:duration-200 data-[closed]:opacity-0" />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4 text-center">
          <Dialog.Panel transition className="modal-panel flex flex-col w-[95vw] h-[95vh] transform overflow-hidden text-left align-middle transition-all data-[enter]:ease-out data-[enter]:duration-300 data-[leave]:ease-in data-[leave]:duration-200 data-[closed]:opacity-0 data-[closed]:scale-95">
            <div className="accent-line-top" />

            <div className="relative z-10 flex items-center justify-between p-4 border-b border-[var(--surface-border)]">
              <Dialog.Title as="h3" className="font-display text-lg font-semibold tracking-wider uppercase text-theme-primary">
                Compare: {filename}
              </Dialog.Title>
              <button type="button" className="logs-modal-close-btn" onClick={onClose} aria-label="Close diff">
                <X size={16} />
              </button>
            </div>

            {result.status === 'ready' && !identical && (
              <div className="grid grid-cols-2 border-b border-[var(--surface-border)] text-xs font-semibold uppercase tracking-wide text-theme-secondary">
                <div className="px-4 py-2">On this server</div>
                <div className="px-4 py-2 border-l border-[var(--surface-border)]">From {repo.name}</div>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto">
              {result.status === 'loading' && (
                <div className="flex h-full items-center justify-center gap-2 text-theme-secondary">
                  <Loader2 size={16} className="animate-spin" /> Loading…
                </div>
              )}
              {result.status === 'error' && (
                <div className="p-4">
                  <div className="alert-error">{result.message}</div>
                </div>
              )}
              {identical && (
                <div className="flex h-full items-center justify-center text-theme-secondary">
                  {lineEndingsOnly
                    ? 'No visible differences — the two copies differ only in line endings.'
                    : 'No differences — the repository copy matches this server\'s file.'}
                </div>
              )}
              {result.status === 'ready' && !identical && (
                <div ref={containerRef} className="plugin-diff-view h-full" />
              )}
            </div>
          </Dialog.Panel>
        </div>
      </div>
    </Dialog>
  );
}

export default PluginDiffModal;
