// Read/write `set <cvar> "<value>"` lines in a server.cfg draft. Generalizes
// the ad hoc sv_hostname sync already used for the Hostname field
// (EditInstanceConfigModal.jsx / AddInstanceForm.jsx) to any cvar a plugin
// manifest declares.

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches `set x "value"` and `seta x value` alike: a hand-written config
// often leaves the quotes off, and treating such a line as absent used to make
// the writer append a second, conflicting `set` for the same cvar.
function buildCvarRegex(cvar) {
  return new RegExp(`^([ \\t]*seta?[ \\t]+${escapeRegExp(cvar)}[ \\t]+)("([^"]*)"|[^\\s"/]+)`, 'im');
}

export function readCvarFromConfig(cfgText, cvar) {
  if (!cvar) return null;
  const match = (cfgText || '').match(buildCvarRegex(cvar));
  if (!match) return null;
  return match[3] !== undefined ? match[3] : match[2];
}

// Quake Live has no quote escaping, so a value can hold neither a quote nor a
// newline -- both are dropped rather than written, since either would end the
// `set` line early and let the rest be read as further config lines (a plugin
// manifest's declared default is untrusted input). An existing line keeps its
// own set/seta keyword and indentation; only the value is rewritten, quoted.
export function sanitizeCvarValue(value) {
  return String(value ?? '').replace(/["\r\n]/g, '');
}

export function upsertCvarInConfig(cfgText, cvar, rawValue) {
  const value = sanitizeCvarValue(rawValue);
  const cfg = cfgText || '';
  const regex = buildCvarRegex(cvar);
  const match = cfg.match(regex);
  // Function form: a value containing $& or $1 must be written literally, not
  // read as a replacement backreference.
  if (match) return cfg.replace(regex, () => `${match[1]}"${value}"`);
  const line = `set ${cvar} "${value}"`;
  return cfg ? `${cfg}\n${line}` : line;
}

// server.cfg stores everything as a quoted string; these translate a typed
// manifest value to/from that string form.
export function serializeCvarValue(type, value) {
  if (type === 'bool') return value ? '1' : '0';
  if (value === null || value === undefined) return '';
  return String(value);
}

export function parseCvarValue(type, rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
  if (type === 'bool') return rawValue === '1' || rawValue.toLowerCase() === 'true';
  if (type === 'number') {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return rawValue;
}
