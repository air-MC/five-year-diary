// 화면 흐름 검증: node tests/e2e/app.e2e.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { serve } from './server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out');
fs.mkdirSync(OUT, { recursive: true });
const NOW = new Date(2026, 10, 15, 9, 0, 0);
let srv, url, browser;

test.before(async () => {
  srv = await serve(0);
  url = `http://127.0.0.1:${srv.address().port}/`;
  browser = await chromium.launch();
});
test.after(async () => { await browser.close(); srv.close(); });

async function fresh({ start = 2026, viewport = { width: 834, height: 1112 } } = {}) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto(url);
  await page.getByTestId('welcome-start').waitFor();
  await page.getByTestId('welcome-year').fill(String(start));
  await page.getByTestId('welcome-start').click();
  await page.getByTestId('block-' + start).waitFor();
  return { ctx, page };
}

// 합성 포인터 이벤트(펜/터치)로 선 긋기
async function drag(page, testid, type, from, to, steps = 8) {
  await page.evaluate(({ testid, type, from, to, steps }) => {
    const el = document.querySelector(`[data-testid="${testid}"]`);
    const r = el.getBoundingClientRect();
    const at = (t) => ({ clientX: r.left + from[0] + (to[0] - from[0]) * t, clientY: r.top + from[1] + (to[1] - from[1]) * t });
    const ev = (name, t) => el.dispatchEvent(new PointerEvent(name, { pointerType: type, pointerId: 7, isPrimary: true, pressure: .6, bubbles: true, cancelable: true, ...at(t) }));
    ev('pointerdown', 0);
    for (let i = 1; i <= steps; i++) ev('pointermove', i / steps);
    ev('pointerup', 1);
  }, { testid, type, from, to, steps });
}
const entry = (page, k) => page.evaluate((k) => new Promise((res) => {
  const o = indexedDB.open('five-year-diary');
  o.onsuccess = () => { const g = o.result.transaction('entries').objectStore('entries').get(k); g.onsuccess = () => res(g.result || null); };
}), k);
const saved = (page) => page.getByTestId('save-state').filter({ hasText: '저장됨' }).waitFor();

test('opens on today with this year highlighted', async () => {
  const { ctx, page } = await fresh();
  assert.equal(await page.getByTestId('page-date').innerText(), '11월 15일');
  assert.match(await page.getByTestId('block-2026').getAttribute('class'), /now/);
  assert.equal(await page.locator('.block').count(), 5);
  await page.screenshot({ path: path.join(OUT, 'ipad.png') });
  await ctx.close();
});

test('keyboard text persists after reload', async () => {
  const { ctx, page } = await fresh();
  await page.getByTestId('tool-keyboard').click();
  await page.getByTestId('text-2026').fill('첫 번째 기록');
  await saved(page);
  await page.reload();
  await page.getByTestId('block-2026').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid=text-2026]').value === '첫 번째 기록');
  await ctx.close();
});

test('pen stroke saves, does not flip, and undo works', async () => {
  const { ctx, page } = await fresh();
  await drag(page, 'canvas-2027', 'pen', [20, 20], [500, 30]);
  await drag(page, 'canvas-2027', 'pen', [20, 60], [300, 70]);
  await saved(page);
  assert.equal(await page.getByTestId('page-date').innerText(), '11월 15일');
  assert.equal((await entry(page, '2027-11-15')).strokes.length, 2);
  await page.getByTestId('tool-undo').click();
  await page.waitForTimeout(400);
  assert.equal((await entry(page, '2027-11-15')).strokes.length, 1);
  await page.reload();
  await page.getByTestId('block-2027').waitFor();
  assert.equal((await entry(page, '2027-11-15')).strokes.length, 1);
  await ctx.close();
});

test('finger swipe flips pages, buttons wrap year end', async () => {
  const { ctx, page } = await fresh();
  await drag(page, 'canvas-2026', 'touch', [600, 40], [150, 50]);
  await page.getByTestId('page-date').filter({ hasText: '11월 16일' }).waitFor();
  await drag(page, 'canvas-2026', 'touch', [150, 40], [600, 50]);
  await page.getByTestId('page-date').filter({ hasText: '11월 15일' }).waitFor();
  await page.getByTestId('open-index').click();
  await page.locator('[data-im="12"]').click();
  await page.locator('#index-sheet [data-id="31"]').click();
  await page.getByTestId('page-date').filter({ hasText: '12월 31일' }).waitFor();
  await page.getByTestId('next').click();
  await page.getByTestId('page-date').filter({ hasText: '1월 1일' }).waitFor();
  await page.getByTestId('today').click();
  await page.getByTestId('page-date').filter({ hasText: '11월 15일' }).waitFor();
  await ctx.close();
});

test('Feb 29 disables non-leap years', async () => {
  const { ctx, page } = await fresh();
  await page.getByTestId('open-index').click();
  await page.locator('[data-im="2"]').click();
  await page.locator('#index-sheet [data-id="29"]').click();
  await page.getByTestId('page-date').filter({ hasText: '2월 29일' }).waitFor();
  assert.match(await page.getByTestId('block-2026').getAttribute('class'), /disabled/);
  assert.doesNotMatch(await page.getByTestId('block-2028').getAttribute('class'), /disabled/);
  assert.equal(await page.getByTestId('text-2026').count(), 0);
  await ctx.close();
});

test('backup roundtrip and bad file rejected', async () => {
  const a = await fresh();
  await a.page.getByTestId('tool-keyboard').click();
  await a.page.getByTestId('text-2026').fill('백업될 문장');
  await a.page.getByTestId('tool-pen').click();
  await drag(a.page, 'canvas-2028', 'pen', [20, 20], [200, 40]);
  await saved(a.page);
  await a.page.getByTestId('open-settings').click();
  const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.getByTestId('backup-export').click()]);
  const file = path.join(OUT, 'backup.json');
  await dl.saveAs(file);
  await a.ctx.close();

  const b = await fresh();
  await b.page.getByTestId('open-settings').click();
  const bad = path.join(OUT, 'bad.json');
  fs.writeFileSync(bad, '{"hello":1}');
  await b.page.getByTestId('backup-file').setInputFiles(bad);
  await b.page.locator('.toast').filter({ hasText: '올바른 백업 파일이 아니에요' }).waitFor();
  await b.page.getByTestId('backup-file').setInputFiles(file);
  await b.page.locator('.toast').filter({ hasText: '복원했어요' }).waitFor();
  await b.page.waitForFunction(() => document.querySelector('[data-testid=text-2026]')?.value === '백업될 문장');
  assert.equal((await entry(b.page, '2028-11-15')).strokes.length, 1);
  await b.ctx.close();
});

test('works offline after first load', async () => {
  const { ctx, page } = await fresh();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // 서비스 워커가 페이지를 제어하도록
  await page.getByTestId('block-2026').waitFor();
  await ctx.setOffline(true);
  await page.reload();
  await page.getByTestId('page-date').filter({ hasText: '11월 15일' }).waitFor();
  await ctx.close();
});

test('phone layout fits', async () => {
  const { ctx, page } = await fresh({ viewport: { width: 390, height: 844 } });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(sw <= 390, 'no horizontal overflow: ' + sw);
  await page.screenshot({ path: path.join(OUT, 'phone.png') });
  await ctx.close();
});
