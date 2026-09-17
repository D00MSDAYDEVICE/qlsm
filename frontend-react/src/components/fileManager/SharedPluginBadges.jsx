import { Loader2, Upload } from 'lucide-react';

const SHARED_PLUGIN_TITLE = 'From the shared plugin folder. Editing it saves a copy for this configuration.';
const MISSING_PLUGIN_TITLE = "This plugin is in QLSM's pool but not on this host yet. Enabling it now would fail to load. Push it to the host first.";

// Trailing badges on a shared plugin row in the Plugins tab: the grey
// "shared" mark, plus an amber "not on host" mark with a push button when
// the host's common pool doesn't hold the file yet (see useHostPoolStatus).
export default function SharedPluginBadges({
  item,
  missingOnHost = new Set(),
  onPushToHost = null,
  pushingToHost = false,
}) {
  if (!item.shared) return null;
  const missing = missingOnHost.has(item.name);
  return (
    <>
      <span
        className="flex-shrink-0 rounded border border-[var(--surface-border)] px-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]"
        title={SHARED_PLUGIN_TITLE}
        data-testid={`plugin-shared-${item.path}`}
      >
        shared
      </span>
      {missing && (
        <span
          className="flex-shrink-0 rounded border border-amber-500/50 bg-amber-500/10 px-1 text-[10px] uppercase tracking-wide text-amber-400"
          title={MISSING_PLUGIN_TITLE}
          data-testid={`plugin-missing-${item.path}`}
        >
          not on host
        </span>
      )}
      {missing && onPushToHost && (
        <button
          type="button"
          onClick={onPushToHost}
          disabled={pushingToHost}
          className="flex-shrink-0 text-amber-400 hover:text-amber-300 disabled:opacity-50"
          title="Push plugin pool to host"
          aria-label={`Push ${item.name} to host`}
          data-testid={`plugin-push-${item.path}`}
        >
          {pushingToHost ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        </button>
      )}
    </>
  );
}
