// The Owner & Admins tab lists admins in one card per level, highest first.
// Empty levels are left out; rows inside a level are ordered by SteamID so the
// list stays put when someone is added or removed.
export const ADMIN_LEVELS = [5, 4, 3, 2, 1];

export function groupAdminsByLevel(rows) {
  return ADMIN_LEVELS
    .map((level) => ({
      level,
      rows: rows
        .filter((row) => Number(row.level) === level)
        .sort((a, b) => a.steamId.localeCompare(b.steamId)),
    }))
    .filter((group) => group.rows.length > 0);
}
