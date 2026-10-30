// Macros' saved shape (G.char.macros; the casting is game/macros.js, the panel ui/macros.js).
export const MACRO_N = 5, MACRO_LEN = 8;
// keys nothing else uses (WASD, Q I K T B H P G F M, Z X C V and the bar's are taken)
export const MACRO_KEYS = ['KeyR', 'KeyE', 'KeyY', 'KeyU', 'KeyO', 'KeyJ', 'KeyL', 'KeyN'];
export const keyLabel = (k) => (k ? k.replace(/^Key/, '') : 'none');
const blank = (i) => ({ name: `Macro ${i + 1}`, skills: [], key: MACRO_KEYS[i], keep: false });
export const newMacros = () => Array.from({ length: MACRO_N }, (_, i) => blank(i));

/** A saved hero's macros, made whole (save.js migrate): five, known keys (no key twice), skill ids only. */
export function migrateMacros(list) {
  const out = newMacros(), used = new Set();
  if (Array.isArray(list)) list.slice(0, MACRO_N).forEach((m, i) => {
    if (!m || typeof m !== 'object') return;
    const o = out[i];
    if (typeof m.name === 'string' && m.name.trim()) o.name = m.name.trim().slice(0, 24);
    o.skills = (Array.isArray(m.skills) ? m.skills : []).filter((id) => typeof id === 'string').slice(0, MACRO_LEN);
    o.key = MACRO_KEYS.includes(m.key) ? m.key : m.key === null ? null : o.key;
    o.keep = !!m.keep;
  });
  for (const o of out) { if (o.key && used.has(o.key)) o.key = null; if (o.key) used.add(o.key); }
  return out;
}
