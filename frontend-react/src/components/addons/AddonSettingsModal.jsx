import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import Modal from '../Modal';
import AddonPanel from './AddonPanel';
import { resolveAddonIcon } from './addonIcons';
import { mountEntriesForAddon } from '../../contexts/AddonsContext';

/**
 * One addon's own settings, opened from the gear icon on its Addons-page
 * card. Renders the addon's declared `settings_section` mounts. They live
 * here rather than on the QLSM Settings page, which is for QLSM's own
 * settings: an addon's configuration belongs where the addon itself is.
 *
 * Callers clear `addon` to close. The last addon is kept so the dialog still
 * has content to show while its leave transition plays.
 */
function AddonSettingsModal({ addon, isOpen, onClose }) {
  const [lastAddon, setLastAddon] = useState(addon);
  if (addon && addon !== lastAddon) setLastAddon(addon);
  const shown = addon ?? lastAddon;

  const mounts = useMemo(
    () => (shown ? mountEntriesForAddon(shown, 'settings_section') : []),
    [shown],
  );
  if (!shown) return null;
  const Icon = resolveAddonIcon(shown.ui?.icon);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      zIndexClass="z-50"
      title={`${shown.name} settings`}
      icon={<Icon size={20} className="mt-1 flex-shrink-0 text-theme-muted" />}
      headerActions={(
        <button type="button" onClick={onClose} aria-label="Close"
                className="rounded-md p-1 text-theme-muted hover:text-theme-primary">
          <X size={18} />
        </button>
      )}
    >
      {mounts.length === 0 && (
        <p className="py-2 text-sm text-theme-muted">This addon has no settings.</p>
      )}
      {mounts.map((mount, index) => {
        const SectionIcon = resolveAddonIcon(mount.icon);
        return (
          <div key={mount.key} className={index > 0 ? 'mt-6' : ''}>
            <div className="mb-2 flex items-center gap-2">
              <SectionIcon size={15} className="text-theme-muted" />
              <h3 className="text-sm font-semibold text-theme-primary">{mount.label}</h3>
            </div>
            <AddonPanel addon={mount.addon} entry={mount.entry} panel={mount.panel}
                        scope={mount.scope} scopeId={0} />
          </div>
        );
      })}
    </Modal>
  );
}

export default AddonSettingsModal;
