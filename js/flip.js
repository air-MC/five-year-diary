// 종이 넘김: 현재 페이지 복제본을 덮개(leaf)로 띄워 회전시키고, 아래에 새 페이지를 렌더
export function flip(container, direction, renderNext) {
  const page = container.querySelector('.page');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!page || reduce) { renderNext(); return Promise.resolve(); }

  const leaf = page.cloneNode(true);
  leaf.classList.add('leaf');
  leaf.querySelectorAll('[data-testid]').forEach((el) => el.removeAttribute('data-testid'));
  leaf.removeAttribute('data-testid');
  // 복제본의 캔버스는 비어 있으므로 원본 내용을 이미지로 옮겨 그림
  const src = page.querySelectorAll('canvas');
  leaf.querySelectorAll('canvas').forEach((c, i) => {
    c.width = src[i].width; c.height = src[i].height;
    c.getContext('2d').drawImage(src[i], 0, 0);
  });
  leaf.querySelectorAll('textarea').forEach((t, i) => { t.value = page.querySelectorAll('textarea')[i].value; });

  if (direction === 'next') {
    renderNext();
    leaf.style.transformOrigin = 'left center';
    container.appendChild(leaf);
    return animate(leaf, [{ transform: 'rotateY(0deg)', filter: 'brightness(1)' },
      { transform: 'rotateY(-95deg)', filter: 'brightness(.94)' }]);
  }
  // 이전 페이지: 새 페이지가 왼쪽에서 덮으며 들어옴
  container.appendChild(leaf);
  leaf.classList.add('under');
  renderNext();
  const fresh = container.querySelector('.page:not(.leaf)');
  fresh.style.transformOrigin = 'left center';
  fresh.style.zIndex = '3';
  return animate(fresh, [{ transform: 'rotateY(-95deg)', filter: 'brightness(.94)' },
    { transform: 'rotateY(0deg)', filter: 'brightness(1)' }], leaf).then(() => { fresh.style.zIndex = ''; fresh.style.transform = ''; });
}

function animate(el, frames, removeAfter = el) {
  const a = el.animate(frames, { duration: 450, easing: 'cubic-bezier(.3,.1,.3,1)' });
  return a.finished.catch(() => {}).then(() => { if (removeAfter.classList.contains('leaf')) removeAfter.remove(); });
}
