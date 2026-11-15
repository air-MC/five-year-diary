// 칸 하나의 손글씨 캔버스. 좌표는 캔버스 CSS 너비 기준 정규화 [x/w, y/w, pressure]
export function createInk(canvas, { getTool, onChange, allowTouch }) {
  const ctx = canvas.getContext('2d');
  let strokes = [];
  const history = []; // 실행취소용: 이전 strokes 스냅샷
  let cur = null;
  let w = 1;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    w = r.width || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  function drawStroke(s) {
    const p = s.p;
    if (!p.length) return;
    ctx.strokeStyle = s.c;
    ctx.fillStyle = s.c;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (p.length === 1) {
      ctx.beginPath();
      ctx.arc(p[0][0] * w, p[0][1] * w, (s.w * (0.5 + p[0][2])) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      ctx.lineWidth = s.w * (0.5 + (a[2] + b[2]) / 2);
      ctx.beginPath();
      if (i > 1) {
        const z = p[i - 2];
        ctx.moveTo(((z[0] + a[0]) / 2) * w, ((z[1] + a[1]) / 2) * w);
        ctx.quadraticCurveTo(a[0] * w, a[1] * w, ((a[0] + b[0]) / 2) * w, ((a[1] + b[1]) / 2) * w);
      } else {
        ctx.moveTo(a[0] * w, a[1] * w);
        ctx.lineTo(((a[0] + b[0]) / 2) * w, ((a[1] + b[1]) / 2) * w);
      }
      ctx.stroke();
    }
    const a = p[p.length - 2], b = p[p.length - 1];
    ctx.beginPath();
    ctx.moveTo(((a[0] + b[0]) / 2) * w, ((a[1] + b[1]) / 2) * w);
    ctx.lineTo(b[0] * w, b[1] * w);
    ctx.stroke();
  }

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach(drawStroke);
    if (cur) drawStroke(cur);
  }

  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    const pr = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
    return [(e.clientX - r.left) / w, (e.clientY - r.top) / w, Math.round(pr * 100) / 100];
  };
  const accepts = (e) => e.pointerType === 'pen' || e.pointerType === 'mouse' || (e.pointerType === 'touch' && allowTouch());

  function eraseAt(pt) {
    const rad = 10 / w;
    const before = strokes.length;
    const kept = strokes.filter((s) => !s.p.some((q) => Math.hypot(q[0] - pt[0], q[1] - pt[1]) < rad));
    if (kept.length !== before) { strokes = kept; redraw(); return true; }
    return false;
  }

  let erasedThisGesture = false;
  canvas.addEventListener('pointerdown', (e) => {
    const tool = getTool();
    if (!accepts(e) || tool.mode === 'keyboard') return;
    e.preventDefault();
    e.stopPropagation();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 */ }
    if (tool.mode === 'eraser') {
      history.push(strokes);
      erasedThisGesture = eraseAt(point(e));
      cur = { erasing: true };
      return;
    }
    cur = { c: tool.color, w: tool.width, p: [point(e)] };
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!cur) return;
    e.preventDefault();
    e.stopPropagation();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (cur.erasing) { (evs.length ? evs : [e]).forEach((ev) => { erasedThisGesture = eraseAt(point(ev)) || erasedThisGesture; }); return; }
    (evs.length ? evs : [e]).forEach((ev) => cur.p.push(point(ev)));
    redraw();
  });
  const end = (e) => {
    if (!cur) return;
    e.stopPropagation();
    if (cur.erasing) {
      if (!erasedThisGesture) history.pop(); else onChange('erase');
    } else {
      history.push(strokes);
      strokes = [...strokes, cur];
      onChange('stroke');
    }
    cur = null;
    erasedThisGesture = false;
    redraw();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  return {
    load(s) { strokes = s || []; history.length = 0; redraw(); },
    strokes: () => strokes,
    undo() { if (!history.length) return false; strokes = history.pop(); redraw(); onChange('undo'); return true; },
    resize,
  };
}
