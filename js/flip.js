// 종이 넘김 — 손가락을 따라 모서리가 접히며 넘어가는 효과.
// 넘어가는 종이 = 접는 선 안쪽만 보이도록 clip-path, 접힌 부분(뒷면)과 그림자는 캔버스에 그림.
// 실제 DOM 페이지는 항상 "새 페이지"이고, 옛 페이지는 스냅샷 복제본으로 대신함.

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function snapshot(page) {
  const s = page.cloneNode(true);
  s.classList.add('snap');
  s.removeAttribute('data-testid');
  s.querySelectorAll('[data-testid]').forEach((el) => el.removeAttribute('data-testid'));
  const src = page.querySelectorAll('canvas');
  s.querySelectorAll('canvas').forEach((c, i) => {
    c.width = src[i].width; c.height = src[i].height;
    c.getContext('2d').drawImage(src[i], 0, 0);
  });
  const tas = page.querySelectorAll('textarea');
  s.querySelectorAll('textarea').forEach((t, i) => { t.value = tas[i].value; t.scrollTop = tas[i].scrollTop; t.tabIndex = -1; });
  return s;
}

// 볼록 다각형을 반평면 f(p) <= 0 으로 자르기 (Sutherland–Hodgman)
function clipPoly(poly, f) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const fa = f(a), fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
      const k = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
    }
  }
  return out;
}

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/**
 * 넘김 시작. direction: 'next' | 'prev'. cornerY: 잡은 높이(0=위, 1=아래).
 * renderNew(): 새 페이지를 실제 DOM으로 그림. renderOld(): 취소 시 옛 페이지로 되돌림.
 * 반환: { drag(dx, dy), release(vx) → Promise<boolean 넘김 여부>, run() → Promise }
 */
export function startTurn(stage, direction, { renderNew, renderOld, cornerY = 0.85 }) {
  const old = stage.querySelector('.page:not(.snap)');
  const snap = snapshot(old);
  stage.appendChild(snap);
  renderNew();
  const real = stage.querySelector('.page:not(.snap)');
  const turning = direction === 'next' ? snap : real;
  const under = direction === 'next' ? real : snap;
  turning.style.zIndex = '3';
  under.style.zIndex = '1';

  const W = stage.clientWidth, H = stage.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  const fx = document.createElement('canvas');
  fx.className = 'turn-fx';
  fx.width = Math.round(W * dpr); fx.height = Math.round(H * dpr);
  stage.appendChild(fx);
  const ctx = fx.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cy = cornerY < 0.5 ? 0 : H;
  const lift = cy === 0 ? 1 : -1; // 아래 모서리는 위로, 위 모서리는 아래로 들림
  const rect = [[0, 0], [W, 0], [W, H], [0, H]];
  let t = direction === 'next' ? 0 : 1; // 0 = 평평하게 덮음, 1 = 완전히 넘어감
  let dyNow = 0;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (t <= 0.002) { turning.style.clipPath = ''; return; }
    if (t >= 0.998) { turning.style.clipPath = 'polygon(0 0, 0 0, 0 0)'; return; }
    const C = [W, cy];
    const P = [W - 2 * W * t, cy + lift * H * 0.12 * Math.sin(Math.PI * t) + dyNow * 0.35];
    const M = [(C[0] + P[0]) / 2, (C[1] + P[1]) / 2];
    const len = Math.hypot(C[0] - P[0], C[1] - P[1]) || 1;
    const n = [(C[0] - P[0]) / len, (C[1] - P[1]) / len];
    const f = (p) => (p[0] - M[0]) * n[0] + (p[1] - M[1]) * n[1];
    const keep = clipPoly(rect, f);
    const folded = clipPoly(rect, (p) => -f(p));
    const flap = folded.map((p) => { const k = 2 * f(p); return [p[0] - k * n[0], p[1] - k * n[1]]; });

    turning.style.clipPath = keep.length > 2
      ? `polygon(${keep.map((p) => `${p[0].toFixed(1)}px ${p[1].toFixed(1)}px`).join(',')})`
      : 'polygon(0 0, 0 0, 0 0)';

    const path = (poly) => { ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); };
    const reach = Math.min(70, len / 2 + 10);

    // 아래 페이지에 드리운 그림자 (접힌 선 바깥쪽)
    if (folded.length > 2) {
      ctx.save(); path(folded); ctx.clip();
      const g = ctx.createLinearGradient(M[0], M[1], M[0] + n[0] * reach, M[1] + n[1] * reach);
      g.addColorStop(0, 'rgba(40,32,20,.30)'); g.addColorStop(1, 'rgba(40,32,20,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    if (flap.length > 2) {
      // 넘어가는 종이 위에 드리운 뒷면의 그림자
      ctx.save(); path(keep); ctx.clip();
      ctx.shadowColor = 'rgba(40,32,20,.28)'; ctx.shadowBlur = 22; ctx.shadowOffsetX = -n[0] * 4; ctx.shadowOffsetY = -n[1] * 4;
      path(flap); ctx.fillStyle = '#EEEAE2'; ctx.fill(); ctx.restore();
      // 종이 뒷면: 접힌 선 근처는 둥글게 휘어 밝고, 끝으로 갈수록 살짝 어두움
      const d = len / 2;
      const g = ctx.createLinearGradient(M[0], M[1], M[0] - n[0] * d, M[1] - n[1] * d);
      g.addColorStop(0, '#E4DFD5'); g.addColorStop(0.12, '#FAF8F3'); g.addColorStop(0.45, '#F3F0EA'); g.addColorStop(1, '#E8E3DA');
      path(flap); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.06)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  function cleanup() {
    snap.remove(); fx.remove();
    const page = stage.querySelector('.page:not(.snap)');
    if (page) { page.style.clipPath = ''; page.style.zIndex = ''; }
  }

  function animateTo(target, ms) {
    if (reduced()) { t = target; return Promise.resolve(); }
    const from = t, t0 = performance.now();
    const dur = ms ?? 180 + 520 * Math.abs(target - from);
    const dy0 = dyNow;
    return new Promise((res) => {
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        t = from + (target - from) * ease(k);
        dyNow = dy0 * (1 - k);
        draw();
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  const done = direction === 'next' ? 1 : 0;
  const undone = 1 - done;
  draw();

  return {
    drag(dx, dy) {
      t = Math.max(0, Math.min(1, direction === 'next' ? -dx / W : 1 - dx / W));
      dyNow = dy;
      draw();
    },
    async release(vx = 0) {
      const moved = Math.abs(t - undone);
      const fling = direction === 'next' ? vx < -0.35 : vx > 0.35;
      const commit = moved > 0.3 || (fling && moved > 0.05);
      await animateTo(commit ? done : undone);
      if (!commit) renderOld();
      cleanup();
      return commit;
    },
    async run() { await animateTo(done, 720); cleanup(); return true; },
  };
}
