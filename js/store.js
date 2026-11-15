// IndexedDB 저장소: entries(key) + settings(단일 레코드)
const DB = 'five-year-diary';

function req(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export async function openStore() {
  const open = indexedDB.open(DB, 1);
  open.onupgradeneeded = () => {
    const db = open.result;
    db.createObjectStore('entries', { keyPath: 'key' });
    db.createObjectStore('settings');
  };
  const db = await req(open);
  try { await navigator.storage?.persist?.(); } catch { /* 지원 안 함 */ }

  const tx = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
  return {
    get: (key) => req(tx('entries').get(key)),
    put: (entry) => req(tx('entries', 'readwrite').put(entry)),
    all: () => req(tx('entries').getAll()),
    putMany: (entries) => new Promise((res, rej) => {
      const t = db.transaction('entries', 'readwrite');
      entries.forEach((e) => t.objectStore('entries').put(e));
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    }),
    getSettings: async () => (await req(tx('settings').get('s'))) || null,
    setSettings: (obj) => req(tx('settings', 'readwrite').put(obj, 's')),
  };
}
