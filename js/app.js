import { DAYS, MONTH_EN, nextDay, prevDay, todayMD, yearsForDay, key } from './dates.js';
import { makeBackup, parseBackup, mergeEntries } from './backup.js';
import { openStore } from './store.js';
import { createInk } from './ink.js';
import { startTurn } from './flip.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const BACKUP_REMIND_DAYS = 7;

const state = {
  store: null,
  settings: null, // {startYear, theme, fingerDraw, lastBackup}
  cur: null, // {m, d}
  tool: { mode: 'pen', color: 0, size: 0 },
  blocks: [], // {year, ink, textarea, dirty}
  saveTimer: null,
  flipping: false,
  undoStack: [],
};
const COLORS = () => ['#3A3A3A', getComputedStyle(document.body).getPropertyValue('--accent').trim(), '#B5715F'];
const SIZES = [2.2, 4];
const toolNow = () => ({ mode: state.tool.mode, color: COLORS()[state.tool.color], width: SIZES[state.tool.size] });

// ---------- 렌더 ----------
function renderPage() {
  const { m, d } = state.cur;
  const today = todayMD();
  $('[data-testid=page-date]').innerHTML = `<b>${m}</b>월 <b>${d}</b>일`;
  $('.date-en').textContent = `${MONTH_EN[m - 1]} ${String(d).padStart(2, '0')}`;
  $$('.tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.m === m));

  const stage = $('[data-testid=stage]');
  const page = document.createElement('section');
  page.className = 'page';
  state.blocks = yearsForDay(state.settings.startYear, { m, d }).map(({ year, disabled }) => {
    const el = document.createElement('div');
    el.className = 'block' + (year === today.y ? ' now' : '') + (disabled ? ' disabled' : '');
    el.dataset.testid = `block-${year}`;
    el.innerHTML = `<div class="yl">${year}</div><div class="area"></div>`;
    page.appendChild(el);
    if (disabled) { $('.area', el).textContent = '윤년이 아니에요'; return { year, disabled }; }
    const ta = document.createElement('textarea');
    ta.dataset.testid = `text-${year}`;
    ta.setAttribute('aria-label', `${year}년 ${m}월 ${d}일`);
    const cv = document.createElement('canvas');
    cv.dataset.testid = `canvas-${year}`;
    $('.area', el).append(ta, cv);
    const b = { year, textarea: ta, dirty: false };
    b.ink = createInk(cv, {
      getTool: toolNow,
      allowTouch: () => !!state.settings.fingerDraw,
      onChange: (kind) => { if (kind !== 'undo') state.undoStack.push(b); markDirty(b); },
    });
    ta.addEventListener('input', () => markDirty(b));
    return b;
  });
  state.undoStack = [];
  const old = $('.page:not(.snap)', stage);
  if (old) old.replaceWith(page); else stage.appendChild(page);
  requestAnimationFrame(() => state.blocks.forEach((b) => b.ink?.resize()));
  loadEntries();
}

async function loadEntries() {
  const { m, d } = state.cur;
  const blocks = state.blocks;
  for (const b of blocks) {
    if (b.disabled) continue;
    const e = await state.store.get(key(b.year, m, d));
    if (blocks !== state.blocks) return; // 그 사이 페이지가 바뀜
    if (e && !b.dirty) { b.textarea.value = e.text || ''; b.ink.load(e.strokes || []); }
  }
}

// ---------- 저장 ----------
function markDirty(b) {
  b.dirty = true;
  setSaveState('저장 중…');
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(flush, 300);
}

async function flush() {
  clearTimeout(state.saveTimer);
  const { m, d } = state.cur;
  const dirty = state.blocks.filter((b) => b.dirty);
  if (!dirty.length) return;
  dirty.forEach((b) => { b.dirty = false; });
  try {
    await state.store.putMany(dirty.map((b) => ({
      key: key(b.year, m, d), text: b.textarea.value, strokes: b.ink.strokes(), updatedAt: Date.now(),
    })));
    setSaveState('저장됨');
  } catch (err) {
    dirty.forEach((b) => { b.dirty = true; });
    setSaveState('저장 실패 — 다시 시도해요');
    console.error(err);
  }
  updateBanner();
}

function setSaveState(t) { $('[data-testid=save-state]').textContent = t; }

// ---------- 이동 ----------
async function go(target, direction) {
  if (state.flipping) return;
  if (target.m === state.cur.m && target.d === state.cur.d) return;
  state.flipping = true;
  flush();
  const turn = startTurn($('[data-testid=stage]'), direction, {
    renderNew: () => { state.cur = target; renderPage(); },
    renderOld: () => {},
  });
  await turn.run();
  state.flipping = false;
}
const goNext = () => go(nextDay(state.cur), 'next');
const goPrev = () => go(prevDay(state.cur), 'prev');
const goToday = () => {
  const t = todayMD();
  const before = state.cur.m * 100 + state.cur.d < t.m * 100 + t.d;
  return go({ m: t.m, d: t.d }, before ? 'next' : 'prev');
};

function bindSwipe() {
  const stage = $('[data-testid=stage]');
  let s = null; // {id, x, y, turn, dir, lastX, lastT, vx}
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || state.flipping) return; // 펜·마우스는 넘김에 쓰지 않음
    if (state.settings.fingerDraw && state.tool.mode !== 'keyboard') return;
    s = { id: e.pointerId, x: e.clientX, y: e.clientY, turn: null, lastX: e.clientX, lastT: e.timeStamp, vx: 0 };
  });
  window.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.turn) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      const dir = dx < 0 ? 'next' : 'prev';
      const orig = state.cur;
      const target = dir === 'next' ? nextDay(orig) : prevDay(orig);
      const r = stage.getBoundingClientRect();
      state.flipping = true;
      flush();
      document.activeElement?.blur?.();
      try { stage.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 */ }
      s.turn = startTurn(stage, dir, {
        cornerY: (s.y - r.top) / r.height,
        renderNew: () => { state.cur = target; renderPage(); },
        renderOld: () => { state.cur = orig; renderPage(); },
      });
    }
    const dt = e.timeStamp - s.lastT;
    if (dt >= 8) { // 너무 촘촘한 표본은 속도를 부풀리므로 건너뜀
      s.vx = Math.max(-3, Math.min(3, 0.7 * ((e.clientX - s.lastX) / dt) + 0.3 * s.vx));
      s.lastX = e.clientX; s.lastT = e.timeStamp;
    }
    s.turn.drag(dx, dy);
  });
  const end = async (e) => {
    if (!s || e.pointerId !== s.id) return;
    const cur = s;
    s = null;
    if (!cur.turn) return;
    await cur.turn.release(e.type === 'pointercancel' ? 0 : cur.vx);
    state.flipping = false;
  };
  // 넘김이 시작되면 손가락 아래 요소가 새 페이지로 바뀌므로, 끝 이벤트는 window에서 받음
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

// ---------- 도구 ----------
function renderTools() {
  document.body.classList.toggle('mode-keyboard', state.tool.mode === 'keyboard');
  $$('.tool[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === state.tool.mode));
  $('.tool.size span').style.setProperty('--dot', state.tool.size ? '9px' : '5px');
  $('.colors').innerHTML = COLORS().map((c, i) =>
    `<button class="color${i === state.tool.color ? ' on' : ''}" data-color="${i}" style="background:${c}" aria-label="색 ${i + 1}"></button>`).join('');
}

function bindTools() {
  $('.toolbar').addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.mode) state.tool.mode = t.dataset.mode;
    else if (t.dataset.color) { state.tool.color = +t.dataset.color; if (state.tool.mode !== 'pen') state.tool.mode = 'pen'; }
    else if (t.dataset.testid === 'tool-size') { state.tool.size = 1 - state.tool.size; state.tool.mode = 'pen'; }
    else if (t.dataset.testid === 'tool-undo') {
      const b = state.undoStack.pop();
      if (b) b.ink.undo();
    }
    if (state.tool.mode !== 'keyboard') document.activeElement?.blur?.();
    renderTools();
  });
}

// ---------- 목록 ----------
let indexMonth = 1;
async function openIndex() {
  indexMonth = state.cur.m;
  await renderIndex();
  $('#index-sheet').hidden = false;
}
async function renderIndex() {
  const keys = new Set((await state.store.all()).filter((e) => e.text || e.strokes?.length).map((e) => e.key.slice(5)));
  const t = todayMD();
  $('#index-sheet .months').innerHTML = Array.from({ length: 12 }, (_, i) =>
    `<button data-im="${i + 1}" class="${i + 1 === indexMonth ? 'on' : ''}">${i + 1}월</button>`).join('');
  $('#index-sheet .days').innerHTML = Array.from({ length: DAYS[indexMonth - 1] }, (_, i) => {
    const d = i + 1;
    const k = `${String(indexMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cls = [keys.has(k) ? 'has' : '', indexMonth === t.m && d === t.d ? 'today' : ''].join(' ');
    return `<button data-id="${d}" class="${cls}">${d}</button>`;
  }).join('');
}
function bindIndex() {
  $('#index-sheet').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (e.target.id === 'index-sheet' || b?.hasAttribute('data-close')) { $('#index-sheet').hidden = true; return; }
    if (!b) return;
    if (b.dataset.im) { indexMonth = +b.dataset.im; renderIndex(); }
    if (b.dataset.id) {
      const target = { m: indexMonth, d: +b.dataset.id };
      const forward = target.m * 100 + target.d > state.cur.m * 100 + state.cur.d;
      $('#index-sheet').hidden = true;
      go(target, forward ? 'next' : 'prev');
    }
  });
  $('.tabs').innerHTML = Array.from({ length: 12 }, (_, i) => `<button data-m="${i + 1}">${i + 1}</button>`).join('');
  $('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    indexMonth = +b.dataset.m;
    renderIndex().then(() => { $('#index-sheet').hidden = false; });
  });
}

// ---------- 설정 · 백업 ----------
async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await state.store.setSettings(state.settings);
}
function applyTheme() {
  document.body.dataset.theme = state.settings.theme || 'sage';
  $$('[data-theme-pick]').forEach((b) => b.classList.toggle('on', b.dataset.themePick === document.body.dataset.theme));
  renderTools();
}
function renderSettings() {
  $('[data-testid=finger-draw]').checked = !!state.settings.fingerDraw;
  $('[data-testid=start-year]').value = state.settings.startYear;
  const lb = state.settings.lastBackup;
  $('[data-testid=backup-info]').textContent = lb
    ? `마지막 백업: ${new Date(lb).toLocaleDateString('ko-KR')}`
    : '아직 백업한 적이 없어요. 기록은 이 기기에만 저장돼요.';
  applyTheme();
}

async function exportBackup() {
  await flush();
  const data = makeBackup(state.settings, await state.store.all());
  const t = todayMD();
  const name = `다섯해의기록_백업_${key(t.y, t.m, t.d)}.json`;
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  let done = false;
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: '다섯 해의 기록 백업' }); done = true; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  if (!done) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  await saveSettings({ lastBackup: Date.now() });
  renderSettings();
  updateBanner();
  toast('백업 파일을 만들었어요');
}

async function importBackup(file) {
  try {
    const { entries } = parseBackup(await file.text());
    const merged = mergeEntries(await state.store.all(), entries);
    await state.store.putMany(merged);
    renderPage();
    toast(`복원했어요 (${entries.length}개 기록)`);
  } catch (err) {
    toast(err.message || '복원하지 못했어요');
  }
}

function bindSettings() {
  const sheet = $('#settings-sheet');
  sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (e.target === sheet || b?.hasAttribute('data-close')) { sheet.hidden = true; return; }
    if (b?.dataset.themePick) { await saveSettings({ theme: b.dataset.themePick }); applyTheme(); }
    if (b?.dataset.testid === 'backup-export') exportBackup();
    if (b?.dataset.testid === 'backup-import') $('[data-testid=backup-file]').click();
  });
  $('[data-testid=backup-file]').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) importBackup(f);
    e.target.value = '';
  });
  $('[data-testid=finger-draw]').addEventListener('change', (e) => saveSettings({ fingerDraw: e.target.checked }));
  $('[data-testid=start-year]').addEventListener('change', async (e) => {
    const y = parseInt(e.target.value, 10);
    if (!(y >= 1900 && y <= 2999)) { e.target.value = state.settings.startYear; return; }
    await flush();
    await saveSettings({ startYear: y });
    renderPage();
  });
}

async function updateBanner() {
  const el = $('[data-testid=backup-banner]');
  const lb = state.settings.lastBackup || 0;
  const days = Math.floor((Date.now() - lb) / 86400000);
  const hasData = (await state.store.all()).some((e) => e.text || e.strokes?.length);
  const snoozed = (state.settings.backupSnooze || 0) > Date.now();
  if (!hasData || days < BACKUP_REMIND_DAYS || snoozed) { el.hidden = true; return; }
  el.innerHTML = `<span>${lb ? `마지막 백업이 ${days}일 전이에요.` : '아직 백업하지 않았어요.'}</span><button data-b="now">지금 백업</button><button class="x" data-b="later">나중에</button>`;
  el.hidden = false;
  $('[data-b=now]', el).onclick = exportBackup;
  $('[data-b=later]', el).onclick = async () => { await saveSettings({ backupSnooze: Date.now() + 3 * 86400000 }); el.hidden = true; };
}

let toastTimer;
function toast(msg) {
  const t = $('.toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

// ---------- 시작 ----------
async function start() {
  state.store = await openStore();
  state.settings = await state.store.getSettings();
  const t = todayMD();
  state.cur = { m: t.m, d: t.d };

  bindTools(); bindIndex(); bindSettings(); bindSwipe();
  $('[data-testid=next]').onclick = goNext;
  $('[data-testid=prev]').onclick = goPrev;
  $('[data-testid=today]').onclick = goToday;
  $('[data-testid=open-index]').onclick = openIndex;
  $('[data-testid=open-settings]').onclick = () => { renderSettings(); $('#settings-sheet').hidden = false; };
  window.addEventListener('resize', () => state.blocks.forEach((b) => b.ink?.resize()));
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') goNext();
    if (e.key === 'ArrowLeft') goPrev();
  });

  if (!state.settings) {
    const w = $('#welcome-sheet');
    $('[data-testid=welcome-year]').value = t.y;
    w.hidden = false;
    await new Promise((res) => { $('[data-testid=welcome-start]').onclick = res; });
    const y = parseInt($('[data-testid=welcome-year]').value, 10);
    state.settings = { startYear: y >= 1900 && y <= 2999 ? y : t.y, theme: 'sage', fingerDraw: false, lastBackup: 0 };
    await state.store.setSettings(state.settings);
    w.hidden = true;
  }
  applyTheme();
  renderPage();
  updateBanner();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
