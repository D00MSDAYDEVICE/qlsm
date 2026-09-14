import { describe, expect, it } from 'vitest';
import { stripQuakeColors } from '../quakeColors';

describe('stripQuakeColors', () => {
  it('removes ^0-^9 codes and trims', () => {
    expect(stripQuakeColors('^1ST^701C ')).toBe('ST01C');
  });
  it('keeps carets that are not color codes', () => {
    expect(stripQuakeColors('a^b')).toBe('a^b');
  });
  it('handles empty input', () => {
    expect(stripQuakeColors(null)).toBe('');
    expect(stripQuakeColors(undefined)).toBe('');
  });
});
