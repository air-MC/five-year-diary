import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, parseBackup, mergeEntries } from '../../js/backup.js';

const e = (key, text, updatedAt) => ({ key, text, strokes: [], updatedAt });

test('roundtrip', () => {
  const s = { startYear: 2026, theme: 'sage' };
  const entries = [e('2026-11-15', '안녕', 5)];
  const out = parseBackup(JSON.stringify(makeBackup(s, entries)));
  assert.deepEqual(out.settings, s);
  assert.deepEqual(out.entries, entries);
});
test('parseBackup rejects bad input', () => {
  assert.throws(() => parseBackup('not json'), /올바른 백업 파일이 아니에요/);
  assert.throws(() => parseBackup(JSON.stringify({ app: 'other', version: 1, entries: [] })), /올바른 백업 파일이 아니에요/);
  assert.throws(() => parseBackup(JSON.stringify({ app: 'five-year-diary', version: 1, entries: 'x' })), /올바른 백업 파일이 아니에요/);
});
test('mergeEntries newer wins and keeps unique keys', () => {
  const local = [e('a', 'old', 1), e('b', 'local-new', 9), e('c', 'only-local', 1)];
  const inc = [e('a', 'new', 2), e('b', 'inc-old', 3), e('d', 'only-inc', 1)];
  const m = Object.fromEntries(mergeEntries(local, inc).map(x => [x.key, x.text]));
  assert.deepEqual(m, { a: 'new', b: 'local-new', c: 'only-local', d: 'only-inc' });
});
