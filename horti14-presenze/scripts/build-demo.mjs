// Builds a self-contained interactive preview of the app (no server needed): the real
// frontend plus demo/mock.js, which simulates the backend in the browser with sample data.
// Usage: node scripts/build-demo.mjs  ->  demo/dist/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUB = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'demo', 'dist');

fs.rmSync(OUT, { recursive: true, force: true });
for (const dir of ['css', 'js', 'icons', 'demo']) fs.mkdirSync(path.join(OUT, dir), { recursive: true });
for (const f of fs.readdirSync(path.join(PUB, 'js'))) fs.copyFileSync(path.join(PUB, 'js', f), path.join(OUT, 'js', f));
for (const f of fs.readdirSync(path.join(PUB, 'icons'))) fs.copyFileSync(path.join(PUB, 'icons', f), path.join(OUT, 'icons', f));
fs.copyFileSync(path.join(PUB, 'css', 'app.css'), path.join(OUT, 'css', 'app.css'));
fs.copyFileSync(path.join(ROOT, 'demo', 'mock.js'), path.join(OUT, 'demo', 'mock.js'));

fs.writeFileSync(
  path.join(OUT, 'index.html'),
  `<title>Presenze Horti 14</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Jost:wght@400;500;600&display=swap" />
<link rel="stylesheet" href="css/app.css" />
<style>
  /* The preview frame already pads the page by the safe areas. */
  .topbar { top: env(safe-area-inset-top, 0px); padding-top: 0; }
  #toasts { top: auto; bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 16px); }

  #demo-bar {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 10px;
    padding: 10px 16px; background: #1f2a22; color: #f6f4ee; font: 500 13px/1.3 var(--sans);
  }
  #demo-bar .db-label { opacity: 0.8; flex-basis: 100%; text-align: center; }
  #demo-bar .db-seg { display: flex; background: rgba(246, 244, 238, 0.12); border-radius: 999px; padding: 3px; }
  #demo-bar button {
    appearance: none; border: 0; background: none; color: inherit; font: 600 13px/1 var(--sans);
    padding: 8px 12px; border-radius: 999px; cursor: pointer; min-height: 32px;
  }
  #demo-bar .db-seg button.on { background: #f6f4ee; color: #1f2a22; }
  #demo-bar [data-demo-remind] { background: rgba(246, 244, 238, 0.14); }
  #demo-bar [data-demo-reset] { text-decoration: underline; text-underline-offset: 3px; opacity: 0.85; }
  #demo-bar button:focus-visible { outline: 2px solid #f6f4ee; outline-offset: 2px; }

  .demo-push {
    position: fixed; z-index: 400; left: 50%; top: calc(10px + env(safe-area-inset-top, 0px));
    width: min(420px, calc(100% - 24px)); transform: translate(-50%, -150%);
    transition: transform 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.1); cursor: pointer;
  }
  .demo-push.show { transform: translate(-50%, 0); }
  .dp-caption { text-align: center; font: 600 11px var(--sans); letter-spacing: 0.08em; text-transform: uppercase; color: #f6f4ee;
    background: rgba(31, 42, 34, 0.82); border-radius: 999px; padding: 4px 10px; width: max-content; margin: 0 auto 6px; }
  .dp-card { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 22px;
    background: rgba(245, 243, 238, 0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22); color: #1d1f1b; font-family: var(--sans); }
  .dp-card img { width: 38px; height: 38px; border-radius: 9px; flex: none; }
  .dp-card > div { flex: 1; min-width: 0; }
  .dp-top { display: flex; justify-content: space-between; font-size: 12px; color: #646a61; }
  .dp-title { font-weight: 700; font-size: 15px; margin-top: 2px; }
  .dp-body { font-size: 14px; color: #3a3f37; }
  @media (prefers-reduced-motion: reduce) { .demo-push { transition: none; } }
</style>
<div id="demo-bar">
  <span class="db-label">Anteprima con dati di esempio · guarda l'app come</span>
  <div class="db-seg" role="group" aria-label="Punto di vista">
    <button type="button" data-demo-role="employee">Dipendente</button>
    <button type="button" data-demo-role="admin">Titolare</button>
  </div>
  <button type="button" data-demo-remind>Simula il promemoria</button>
  <button type="button" data-demo-reset>Ricomincia</button>
</div>
<div id="app"><div class="boot"><div class="brand"><span class="brand-name">HORTI 14</span></div><div class="boot-dot"></div></div></div>
<div id="toasts" aria-live="polite"></div>
<script type="module" src="demo/mock.js"></script>
<script type="module" src="js/app.js"></script>
`,
);
console.log('Preview built in', path.relative(process.cwd(), OUT));
