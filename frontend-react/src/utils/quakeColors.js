export const QUAKE_COLORS = Object.freeze({
  0: '#abb2bf',
  1: '#ff4444',
  2: '#44ff44',
  3: '#ffff44',
  4: '#6688ff',
  5: '#44ffff',
  6: '#ff44ff',
  7: '#e0e0e0',
  8: '#ff9933',
  9: '#aaaaaa',
});

// Plain-text form of a Quake name: drops ^0-^9 color codes, keeps any other caret.
export const stripQuakeColors = (text) => String(text ?? '').replace(/\^[0-9]/g, '').trim();
