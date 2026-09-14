import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Crown, ExternalLink, RotateCw, ShieldPlus } from 'lucide-react';
import { createOperator, getOperators } from '../../services/api';
import { setOperatorsCache } from '../../utils/operatorsCache';
import { readOwnerFromConfig, writeOwnerToConfig } from '../../utils/operatorConfigSync';
import { stripQuakeColors } from '../../utils/quakeColors';
import OperatorCombobox from './OperatorCombobox';
import AdminRow from './AdminRow';
import AddOperatorModal from './AddOperatorModal';
import useInstanceAdmins from './useInstanceAdmins';
import { groupAdminsByLevel } from '../../utils/adminLevels';

// Owner comes from qlx_owner in server.cfg (minqlx reads the cvar). Admin
// levels live only in the instance's minqlx Redis database: the tab shows what
// the server has, and a save writes back just the changes. `instanceId` is null wherever there
// is no running server to read -- Add Instance and the preset pages.
function OwnerAdminEditor({
  serverCfgContent,
  onServerCfgChange,
  instanceId = null,
  adminEntries = null,
  onAdminEntriesChange,
  onAdminEntriesLoaded,
  adminsPreload = null,
}) {
  const [operators, setOperators] = useState([]);
  const [pendingAdmin, setPendingAdmin] = useState('');
  const [pendingLevel, setPendingLevel] = useState('5');
  // The admin row whose SteamID is being added to the directory, or null.
  const [directoryRow, setDirectoryRow] = useState(null);

  const applyOperators = (data) => {
    const list = data || [];
    setOperators(list);
    setOperatorsCache(list);
  };

  useEffect(() => {
    let cancelled = false;
    getOperators()
      .then((data) => { if (!cancelled) applyOperators(data); })
      .catch(() => { if (!cancelled) setOperators([]); });
    return () => { cancelled = true; };
  }, []);

  // Errors propagate so AddOperatorModal shows them inline and stays open.
  const handleCreateOperator = async (operatorData) => {
    await createOperator(operatorData);
    applyOperators(await getOperators());
  };

  // The parent owns the list: it passes adminEntries in and the hook's mutators
  // call onAdminEntriesChange. Nothing is mirrored upward from an effect -- that
  // loops forever and marks the modal dirty on open.
  // Reads as soon as the editor mounts, even behind a hidden tab, so the tab
  // opens already filled. `adminsPreload` is the request Edit Configuration
  // started on open; awaiting it avoids a second SSH read.
  const {
    rows, loading, error, editable, refresh, addAdmin, removeAdmin,
  } = useInstanceAdmins({
    instanceId,
    active: Boolean(instanceId),
    entries: adminEntries,
    onChange: onAdminEntriesChange,
    onLoaded: onAdminEntriesLoaded,
    preload: adminsPreload,
  });

  const operatorsById = useMemo(() => {
    const map = new Map();
    operators.forEach((op) => map.set(op.steam_id64, op));
    return map;
  }, [operators]);

  const ownerSteamId = readOwnerFromConfig(serverCfgContent);
  const handleOwnerChange = (steamId) => onServerCfgChange(writeOwnerToConfig(serverCfgContent, steamId));

  const handleSelectPendingAdmin = (steamId) => {
    setPendingAdmin(steamId);
    const operator = operatorsById.get(steamId);
    if (operator && operator.default_level != null) setPendingLevel(String(operator.default_level));
  };

  const handleAddAdmin = () => {
    if (!pendingAdmin) return;
    addAdmin(pendingAdmin, pendingLevel);
    setPendingAdmin('');
    setPendingLevel('5');
  };

  const assignable = operators.filter((op) => !rows.some((row) => row.steamId === op.steam_id64));

  const levelGroups = groupAdminsByLevel(rows);
  // Count what the cards show: a legacy level-0 preset entry is not an admin.
  const adminCount = levelGroups.reduce((n, group) => n + group.rows.length, 0);
  const card = 'rounded-xl border border-[var(--surface-border)] bg-[var(--surface-elevated)] p-4';
  const sectionTitle = 'font-display text-sm font-semibold tracking-wider uppercase text-[var(--accent-primary)]';

  return (
    <div className="mb-4 space-y-5">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className={`${sectionTitle} flex items-center gap-1.5`}>
            <Crown size={15} /> Server Owner
          </h3>
          <a href="/settings/operators" target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1 text-xs text-[var(--accent-primary)] hover:underline">
            Manage operators <ExternalLink size={12} />
          </a>
        </div>
        <div className={card}>
          <OperatorCombobox
            value={ownerSteamId}
            onChange={handleOwnerChange}
            operators={operators}
            placeholder="Select owner…"
          />
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Writes <code className="text-[var(--text-secondary)]">qlx_owner</code> in server.cfg. Applies on restart.
          </p>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className={`${sectionTitle} flex items-center gap-1.5`}>
            <ShieldPlus size={15} /> Server Admins
            <span data-testid="admin-count"
                  className="ml-1 rounded bg-[var(--accent-primary)] px-1.5 py-0.5 font-mono text-xs font-bold text-white dark:text-black">
              {adminCount}
            </span>
          </h3>
          {instanceId && (
            <button type="button" onClick={refresh} disabled={loading}
                    className="flex items-center gap-1 text-xs text-[var(--accent-primary)] hover:underline disabled:opacity-50">
              <RotateCw size={12} className={loading ? 'animate-spin' : undefined} /> Refresh
            </button>
          )}
        </div>

        {error && (
          <div className="mb-2 flex items-start gap-2 rounded-md border border-[var(--accent-warning)]/40 bg-[var(--accent-warning)]/10 px-2.5 py-1.5 text-xs text-[var(--text-secondary)]">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-[var(--accent-warning)]" />
            <span>{error} Admins can't be edited until the server can be read.</span>
          </div>
        )}
        {instanceId && loading && rows.length === 0 && !error && (
          <p className="mb-2 text-xs text-[var(--text-muted)]">Reading admins from the server…</p>
        )}

        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <OperatorCombobox
              value={pendingAdmin}
              onChange={handleSelectPendingAdmin}
              operators={assignable}
              placeholder="Add operator as admin…"
              allowClear={false}
              disabled={!editable}
            />
          </div>
          <div className="w-16 flex-shrink-0">
            <select value={pendingLevel} onChange={(e) => setPendingLevel(e.target.value)} className="input-base"
                    aria-label="Admin level" disabled={!editable}>
              {/* No 0: a level-0 entry is "not an admin", and removal is how
                  a level is revoked. The API still accepts 0 so rows imported
                  from legacy "steamid|0" lines stay valid. */}
              {[1, 2, 3, 4, 5].map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
            </select>
          </div>
          <button type="button" onClick={handleAddAdmin} disabled={!pendingAdmin || !editable}
                  className="btn btn-secondary flex-shrink-0 px-3">
            Add
          </button>
        </div>

        {levelGroups.map((group) => (
          <div key={group.level} data-testid={`admin-level-${group.level}`} className={`${card} mt-3`}>
            <h4 className="mb-2 font-display text-lg font-semibold tracking-wider uppercase text-[var(--text-muted)]">
              Level {group.level}
            </h4>
            <ul className="space-y-1.5">
              {group.rows.map((row) => (
                <AdminRow
                  key={row.steamId}
                  row={row}
                  operator={operatorsById.get(row.steamId) || null}
                  onRemove={removeAdmin}
                  disabled={!editable}
                  onAddToDirectory={() => setDirectoryRow(row)}
                />
              ))}
            </ul>
          </div>
        ))}

        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Applies the in-game permission level on Save (may take up to ~30s to take effect).
        </p>
      </section>

      <AddOperatorModal
        isOpen={directoryRow !== null}
        onClose={() => setDirectoryRow(null)}
        onSubmit={handleCreateOperator}
        initialSteamId={directoryRow?.steamId || ''}
        initialLevel={directoryRow?.level ?? null}
        initialName={stripQuakeColors(directoryRow?.inGameName)}
      />
    </div>
  );
}

export default OwnerAdminEditor;
