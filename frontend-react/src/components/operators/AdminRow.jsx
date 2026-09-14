import React from 'react';
import { UserPlus, X } from 'lucide-react';
import { QuakeColorSpans } from '../rcon/QuakeColoredText';

// One admin in a level card of the Owner & Admins tab. `row` comes from
// useInstanceAdmins: {steamId, level, inGameName}. The card header already shows
// the level, so the row doesn't. The first line is the directory name, else the
// in-game name minqlx recorded in Redis, else the SteamID; the SteamID gets a
// second line only when the first line is a name.
//
// The row carries a data-testid of `admin-row-<steamId>` so a sibling test can
// target it directly instead of matching text fragmented across the name and
// SteamID spans (e.g. `getByTestId('admin-row-76561198012345678')`).
function AdminRow({ row, operator, onRemove, onAddToDirectory, disabled = false }) {
  const hasName = Boolean(operator || row.inGameName);
  return (
    <li
      data-testid={`admin-row-${row.steamId}`}
      className="flex items-center justify-between gap-3 rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-2 text-sm"
    >
      <div className="min-w-0">
        {/* The name gets its own element so getByText('Vex') can match it. */}
        <div className="truncate text-[var(--text-primary)]">
          {operator
            ? <span>{operator.name}</span>
            : row.inGameName
              ? <span data-testid="admin-in-game-name"><QuakeColorSpans text={row.inGameName} /></span>
              : <span className="font-mono">{row.steamId}</span>}
        </div>
        {hasName && (
          <div className="truncate font-mono text-xs text-[var(--text-muted)]">{row.steamId}</div>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {!operator && onAddToDirectory && (
          <button type="button" onClick={() => onAddToDirectory(row.steamId)}
                  className="btn btn-secondary gap-1.5 px-2.5 py-1 text-xs">
            <UserPlus size={12} /> Add to Operators
          </button>
        )}
        {onRemove && (
          <button type="button" onClick={() => onRemove(row.steamId)} title="Remove admin"
                  aria-label="Remove admin" disabled={disabled}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-danger)] disabled:opacity-40">
            <X size={14} />
          </button>
        )}
      </div>
    </li>
  );
}

export default AdminRow;
