import test from 'node:test';
import assert from 'node:assert/strict';
import { DAYS, isLeap, nextDay, prevDay, todayMD, yearsForDay, key } from '../../js/dates.js';

test('DAYS has 29 for Feb', () => assert.equal(DAYS[1], 29));
test('isLeap', () => {
  assert.equal(isLeap(2028), true);
  assert.equal(isLeap(2026), false);
  assert.equal(isLeap(2100), false);
  assert.equal(isLeap(2000), true);
});
test('nextDay/prevDay wrap', () => {
  assert.deepEqual(nextDay({ m: 12, d: 31 }), { m: 1, d: 1 });
  assert.deepEqual(prevDay({ m: 1, d: 1 }), { m: 12, d: 31 });
  assert.deepEqual(nextDay({ m: 2, d: 28 }), { m: 2, d: 29 });
  assert.deepEqual(nextDay({ m: 2, d: 29 }), { m: 3, d: 1 });
  assert.deepEqual(prevDay({ m: 3, d: 1 }), { m: 2, d: 29 });
});
test('todayMD', () => assert.deepEqual(todayMD(new Date(2026, 10, 15)), { y: 2026, m: 11, d: 15 }));
test('yearsForDay disables Feb 29 in non-leap years', () => {
  const ys = yearsForDay(2026, { m: 2, d: 29 });
  assert.deepEqual(ys.map(y => y.year), [2026, 2027, 2028, 2029, 2030]);
  assert.deepEqual(ys.map(y => y.disabled), [true, true, false, true, true]);
  assert.ok(yearsForDay(2026, { m: 3, d: 1 }).every(y => !y.disabled));
});
test('key pads', () => assert.equal(key(2026, 1, 5), '2026-01-05'));
