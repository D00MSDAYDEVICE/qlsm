import React, { useState } from 'react';
import { Dialog, DialogBackdrop } from '@headlessui/react';
import { AlertTriangle, GitCompare } from 'lucide-react';
import PluginDiffModal from './PluginDiffModal';

// Download blocked because these files are already in the local pool: pick
// which to replace, optionally comparing each one first. Mounted only while
// open, so the ticks start fresh for every blocked download.
function OverwritePluginsModal({ isOpen, repo, files, onConfirm, onClose }) {
  const [ticked, setTicked] = useState(() => new Set(files.map(f => f.filename)));
  const [diffFile, setDiffFile] = useState(null);

  const toggle = (filename) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const selected = files.map(f => f.filename).filter(name => ticked.has(name));

  return (
    <Dialog open={isOpen} as="div" className="relative z-10" onClose={onClose}>
      <DialogBackdrop transition className="modal-backdrop fixed inset-0 transition data-[enter]:ease-out data-[enter]:duration-300 data-[leave]:ease-in data-[leave]:duration-200 data-[closed]:opacity-0" />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4 text-center">
          <Dialog.Panel transition className="modal-panel w-full max-w-lg transform overflow-hidden p-6 text-left align-middle transition-all data-[enter]:ease-out data-[enter]:duration-300 data-[leave]:ease-in data-[leave]:duration-200 data-[closed]:opacity-0 data-[closed]:translate-y-4 data-[closed]:scale-95">
            <div className="accent-line-top" />

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-[#FF3366]/10 border border-red-200 dark:border-[#FF3366]/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-[#FF3366]" />
              </div>
              <div className="flex-1 min-w-0">
                <Dialog.Title as="h3" className="font-display text-lg font-semibold tracking-wide text-theme-primary">
                  Overwrite existing plugins?
                </Dialog.Title>
                <p className="mt-2 text-sm text-theme-secondary">
                  These files are already in the local pool. Tick the ones to replace with {repo.name}&apos;s copy.
                  Each plugin&apos;s <code className="font-mono">.ql-plugin.json</code> sidecar is replaced or removed along with it.
                </p>
                <ul className="mt-4 space-y-2">
                  {files.map(({ filename }) => (
                    <li key={filename} className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-gray-500 text-blue-500 focus:ring-blue-500"
                          checked={ticked.has(filename)}
                          onChange={() => toggle(filename)}
                          aria-label={filename}
                        />
                        <span className="font-mono text-sm text-theme-primary truncate">{filename}</span>
                      </label>
                      <button
                        type="button"
                        className="btn btn-secondary text-xs px-2 py-1 flex items-center gap-1"
                        onClick={() => setDiffFile(files.find(f => f.filename === filename))}
                        aria-label={`Diff ${filename}`}
                      >
                        <GitCompare size={14} /> Diff
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={selected.length === 0}
                onClick={() => onConfirm(selected)}
              >
                Overwrite selected
              </button>
            </div>

            {diffFile && (
              <PluginDiffModal
                isOpen
                onClose={() => setDiffFile(null)}
                repo={repo}
                filename={diffFile.filename}
                runtime={diffFile.runtime}
              />
            )}
          </Dialog.Panel>
        </div>
      </div>
    </Dialog>
  );
}

export default OverwritePluginsModal;
