// Renders the default app icons (two interlocking rings) to PNG.
// Usage: node scripts/make-icons.mjs  (needs Playwright + Chromium, dev only)
import { chromium } from 'playwright';
import path from 'node:path';

const out = path.resolve('public/icons');
const rings = (stroke) => `
  <circle cx="212" cy="286" r="92" fill="none" stroke="${stroke}" stroke-width="22"/>
  <circle cx="300" cy="286" r="92" fill="none" stroke="${stroke}" stroke-width="22"/>
  <path d="M300 150 l24 24 -24 26 -24 -26z" fill="${stroke}"/>`;
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C8F76"/><stop offset="1" stop-color="#62745D"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>${rings('#FBF8F3')}</svg>`;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 90 432 380">${rings('#FFFFFF')}</svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage();
async function render(svg, size, file, transparent = false) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(out, file), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
}
await render(full, 512, 'icon-512.png');
await render(full, 192, 'icon-192.png');
await render(full, 180, 'apple-touch-icon.png');
await render(full, 512, 'maskable-512.png');
await render(badge, 96, 'badge-96.png', true);
await browser.close();
console.log('icons written to', out);
