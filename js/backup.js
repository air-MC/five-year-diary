const APP = 'five-year-diary';
const BAD = '올바른 백업 파일이 아니에요';

export const makeBackup = (settings, entries) =>
  ({ app: APP, version: 1, exportedAt: new Date().toISOString(), settings, entries });

export function parseBackup(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error(BAD); }
  if (!o || o.app !== APP || o.version !== 1 || !Array.isArray(o.entries)) throw new Error(BAD);
  if (!o.entries.every((e) => e && typeof e.key === 'string' && typeof e.updatedAt === 'number')) throw new Error(BAD);
  return { settings: o.settings || {}, entries: o.entries };
}

export function mergeEntries(local, incoming) {
  const map = new Map(local.map((e) => [e.key, e]));
  for (const e of incoming) {
    const cur = map.get(e.key);
    if (!cur || e.updatedAt > cur.updatedAt) map.set(e.key, e);
  }
  return [...map.values()];
}
