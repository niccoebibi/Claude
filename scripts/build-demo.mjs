// Builds a self-contained interactive preview of the app (no server needed):
// the real frontend plus demo/mock.js, which simulates the backend in the browser.
// Usage: node scripts/build-demo.mjs  ->  demo/dist/
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import QRCode from 'qrcode';
import { ACCENTS } from '../server/theme.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUB = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'demo', 'dist');
const DEMO_URL = 'https://www.17aprile2027.it';

// Same first-run content as the real app. The couple's illustrations are downloaded into
// demo/assets/ (git-ignored) on the first build.
const INITIAL = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'matrimonio.json'), 'utf8'));
const IMAGES = INITIAL.images || {};
// The couple's quiz lives in config/quiz.json, kept out of the public repository.
const QUIZ_FILE = path.join(ROOT, 'config', 'quiz.json');
if (fs.existsSync(QUIZ_FILE)) INITIAL.settings.quiz = JSON.parse(fs.readFileSync(QUIZ_FILE, 'utf8'));
else console.warn('config/quiz.json non trovato: anteprima senza il gioco degli sposi');

fs.rmSync(OUT, { recursive: true, force: true });
for (const dir of ['css', 'js', 'icon', 'demo', 'img']) fs.mkdirSync(path.join(OUT, dir), { recursive: true });

const ASSETS = path.join(ROOT, 'demo', 'assets');
fs.mkdirSync(ASSETS, { recursive: true });
for (const [name, url] of Object.entries(IMAGES)) {
  const file = path.join(ASSETS, name);
  if (!fs.existsSync(file)) execFileSync('curl', ['-sSfL', '--max-time', '60', '-o', file, url]);
  fs.copyFileSync(file, path.join(OUT, 'img', name));
}

/** Apply literal replacements, failing if a pattern no longer matches the app code. */
function patch(file, pairs) {
  let src = fs.readFileSync(path.join(PUB, 'js', file), 'utf8');
  for (const [from, to, expected = 1] of pairs) {
    const count = src.split(from).length - 1;
    if (count !== expected) throw new Error(`${file}: expected ${expected}× ${JSON.stringify(from)}, found ${count}`);
    src = src.split(from).join(to);
  }
  fs.writeFileSync(path.join(OUT, 'js', file), src);
}

patch('app.js', [
  ['  registerServiceWorker();\n', '  if (!window.__DEMO) registerServiceWorker();\n'],
  ['export async function pushState() {\n', 'export async function pushState() {\n  if (window.__DEMO) return window.__DEMO.pushState();\n'],
  ['async function enablePush() {\n', 'async function enablePush() {\n  if (window.__DEMO) return window.__DEMO.enablePush();\n'],
  ['async function syncPushSubscription() {\n', 'async function syncPushSubscription() {\n  if (window.__DEMO) return;\n'],
  ['`/uploads/${', '`${', 2],
]);
patch('admin.js', [
  ['`/uploads/${', '`${', 2],
  ['src="/uploads/${esc(s.coverImage)}"', 'src="${esc(s.coverImage)}"'],
  ['src="/icon/icon-192.png?v=${s.iconVersion}"', 'src="${window.__DEMO?.icon || `icon/icon-192.png?v=${s.iconVersion}`}"'],
  ['/api/admin/qr.svg', 'qr.svg', 3],
  ['${esc(location.host)}', '${esc(window.__DEMO?.host || location.host)}'],
]);
fs.copyFileSync(path.join(PUB, 'js', 'util.js'), path.join(OUT, 'js', 'util.js'));
fs.copyFileSync(path.join(PUB, 'js', 'effects.js'), path.join(OUT, 'js', 'effects.js'));
fs.copyFileSync(path.join(PUB, 'css', 'app.css'), path.join(OUT, 'css', 'app.css'));
for (const f of fs.readdirSync(path.join(PUB, 'icons'))) {
  fs.copyFileSync(path.join(PUB, 'icons', f), path.join(OUT, 'icon', f));
}
fs.copyFileSync(path.join(ROOT, 'demo', 'mock.js'), path.join(OUT, 'demo', 'mock.js'));
fs.writeFileSync(
  path.join(OUT, 'demo', 'initial.js'),
  `window.__INITIAL = ${JSON.stringify({ settings: INITIAL.settings, tables: INITIAL.tables })};\n`,
);
fs.writeFileSync(
  path.join(OUT, 'qr.svg'),
  await QRCode.toString(DEMO_URL, { type: 'svg', margin: 1, color: { dark: '#2E2A26', light: '#FFFFFF' } }),
);

fs.writeFileSync(
  path.join(OUT, 'index.html'),
  `<title>App del matrimonio</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600;700&family=Italianno&family=Press+Start+2P&display=swap" />
<link rel="stylesheet" href="css/app.css" />
<style>
  :root { --accent: ${ACCENTS[INITIAL.settings.accent]?.color || ACCENTS.salvia.color}; }
  /* The preview frame already pads the page by the safe areas. */
  .topbar { top: env(safe-area-inset-top, 0px); padding-top: 8px; }
  /* Toasts at the bottom so they never collide with the notification preview at the top. */
  #toasts { top: auto; bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 84px); }

  #demo-bar {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 12px;
    padding: 8px 16px; background: #2e2a26; color: #fbf8f3; font: 500 13px/1.3 var(--sans);
  }
  #demo-bar .db-label { opacity: 0.8; }
  #demo-bar .db-url {
    flex-basis: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
    max-width: 420px; margin: 0 auto; padding: 7px 14px; border-radius: 12px;
    background: rgba(251, 248, 243, 0.14); font: 600 14px/1.2 var(--sans); letter-spacing: 0.01em;
  }
  #demo-bar .db-url svg { width: 12px; height: 12px; opacity: 0.8; }
  #demo-bar .db-seg { display: flex; background: rgba(251, 248, 243, 0.12); border-radius: 999px; padding: 3px; }
  #demo-bar button {
    appearance: none; border: 0; background: none; color: inherit; font: 600 13px/1 var(--sans);
    padding: 7px 12px; border-radius: 999px; cursor: pointer;
  }
  #demo-bar .db-seg button.on { background: #fbf8f3; color: #2e2a26; }
  #demo-bar [data-demo-reset] { text-decoration: underline; text-underline-offset: 3px; opacity: 0.85; }
  #demo-bar button:focus-visible { outline: 2px solid #fbf8f3; outline-offset: 2px; }

  .demo-push {
    position: fixed; z-index: 400; left: 50%; top: calc(10px + env(safe-area-inset-top, 0px));
    width: min(420px, calc(100% - 24px)); transform: translate(-50%, -140%);
    transition: transform 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.1); cursor: pointer;
  }
  .demo-push.show { transform: translate(-50%, 0); }
  .dp-caption { text-align: center; font: 600 11px var(--sans); letter-spacing: 0.08em; text-transform: uppercase; color: #fbf8f3;
    background: rgba(46, 42, 38, 0.8); border-radius: 999px; padding: 4px 10px; width: max-content; margin: 0 auto 6px; }
  .dp-card { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 22px;
    background: rgba(245, 242, 238, 0.94); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22); color: #1d1b19; font-family: var(--sans); }
  .dp-card img { width: 38px; height: 38px; border-radius: 9px; flex: none; }
  .dp-card > div { flex: 1; min-width: 0; }
  .dp-top { display: flex; justify-content: space-between; font-size: 12px; color: #6b635b; }
  .dp-title { font-weight: 700; font-size: 15px; margin-top: 2px; }
  .dp-body { font-size: 14px; color: #3d3833; }
  @media (prefers-reduced-motion: reduce) { .demo-push { transition: none; } }
</style>
<div id="demo-bar">
  <div class="db-url" aria-label="Indirizzo dell'app"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>17aprile2027.it</div>
  <span class="db-label">Anteprima · invitati e tavoli di esempio · guarda come</span>
  <div class="db-seg" role="group" aria-label="Punto di vista">
    <button type="button" data-demo-role="guest">Invitato</button>
    <button type="button" data-demo-role="admin">Sposi (Regia)</button>
  </div>
  <button type="button" data-demo-reset>Ricomincia</button>
</div>
<div id="app">
  <div class="boot">
    <div class="boot-rings" aria-hidden="true"></div>
    <div class="boot-names">Niccolò &amp; Beatrice</div>
  </div>
</div>
<div id="toasts" aria-live="polite"></div>
<script src="demo/initial.js"></script>
<script src="demo/mock.js"></script>
<script type="module" src="js/app.js"></script>
`,
);
console.log('Preview built in', path.relative(ROOT, OUT));
