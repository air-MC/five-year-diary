// 앱 아이콘 생성: node tools/make-icons.mjs
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const html = (s) => `<html><head><style>
@font-face{font-family:P;font-weight:300;src:url('file://${ROOT}/fonts/Pretendard-Light.woff2')}
body{margin:0;width:${s}px;height:${s}px;background:#FCFBF8;display:grid;place-items:center}
div{width:${s * .5}px;height:${s * .5}px;border-radius:50%;border:${s * .018}px solid #7C9A82;display:grid;place-items:center;
font-family:P;font-weight:300;font-size:${s * .24}px;color:#7C9A82;box-sizing:border-box;padding-bottom:${s * .01}px}
</style></head><body><div>5</div></body></html>`;
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
for (const [s, name] of [[192, 'icon-192'], [512, 'icon-512'], [180, 'apple-touch-icon']]) {
  const p = await b.newPage({ viewport: { width: s, height: s } });
  await p.setContent(html(s));
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(ROOT, 'icons', name + '.png') });
}
await b.close();
