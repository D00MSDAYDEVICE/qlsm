import React, { useState } from 'react';
import { X } from 'lucide-react';
import Modal from '../Modal';
import AddonPanel from './AddonPanel';
import { resolveAddonIcon } from './addonIcons';

/**
 * Dialog shell for an addon panel opened from a host or instance action menu.
 *
 * Core owns the shell -- backdrop, title, close button, escape handling -- and
 * the addon supplies only the body, the same split the instance tab and the
 * full page use.
 *
 * Callers clear `mount` to close. The last mount is kept so the dialog still
 * has content to show while its leave transition plays.
 */
function AddonModal({ isOpen, onClose, mount, scopeId, subtitle }) {
  const [lastMount, setLastMount] = useState(mount);
  if (mount && mount !== lastMount) setLastMount(mount);
  const shown = mount ?? lastMount;
  if (!shown) return null;
  const Icon = resolveAddonIcon(shown.icon);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      zIndexClass="z-50"
      title={shown.label}
      icon={<Icon size={20} className="mt-1 flex-shrink-0 text-theme-muted" />}
      headerActions={(
        <button type="button" onClick={onClose} aria-label="Close"
                className="rounded-md p-1 text-theme-muted hover:text-theme-primary">
          <X size={18} />
        </button>
      )}
    >
      {subtitle && <p className="mb-3 truncate text-xs text-theme-muted">{subtitle}</p>}
      <AddonPanel addon={shown.addon} entry={shown.entry} panel={shown.panel}
                  scope={shown.scope} scopeId={scopeId} />
    </Modal>
  );
}

export default AddonModal;
