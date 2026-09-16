import { describe, expect, it } from 'vitest';
import { groupAdminsByLevel } from '../adminLevels';

const row = (steamId, level) => ({ steamId, level });

describe('groupAdminsByLevel', () => {
  it('groups highest level first and skips empty levels', () => {
    const groups = groupAdminsByLevel([row('3', 3), row('5', 5), row('1', 1)]);
    expect(groups.map((g) => g.level)).toEqual([5, 3, 1]);
  });

  it('orders rows inside a level by SteamID', () => {
    const groups = groupAdminsByLevel([row('76561198000000002', 4), row('76561198000000001', 4)]);
    expect(groups[0].rows.map((r) => r.steamId)).toEqual(['76561198000000001', '76561198000000002']);
  });

  it('accepts string levels and ignores levels outside 1-5', () => {
    const groups = groupAdminsByLevel([row('a', '2'), row('b', 0)]);
    expect(groups).toEqual([{ level: 2, rows: [row('a', '2')] }]);
  });

  it('returns nothing for no rows', () => {
    expect(groupAdminsByLevel([])).toEqual([]);
  });
});
