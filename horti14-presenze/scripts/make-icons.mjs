// Renders the app icons (the «H14» monogram on botanical green) to PNG.
// Usage: node scripts/make-icons.mjs  (needs Playwright + Chromium, dev only)
import { chromium } from 'playwright';
import path from 'node:path';

const out = path.resolve(import.meta.dirname, '..', 'public', 'icons');
const leaf = (color) =>
  `<path d="M256 118c-46 38-66 84-58 128 6 34 28 58 58 70 30-12 52-36 58-70 8-44-12-90-58-128z" fill="none" stroke="${color}" stroke-width="10"/>
   <line x1="256" y1="150" x2="256" y2="316" stroke="${color}" stroke-width="8"/>`;
const mark = (color) =>
  `<text x="256" y="408" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-weight="600" font-size="92" letter-spacing="10" fill="${color}">H14</text>`;
const full = (inset = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-inset} ${-inset} ${512 + inset * 2} ${512 + inset * 2}">
  <rect x="${-inset}" y="${-inset}" width="${512 + inset * 2}" height="${512 + inset * 2}" fill="#33483C"/>${leaf('#E5EBE4')}${mark('#F6F4EE')}</svg>`;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="120 100 272 240">${leaf('#FFFFFF').replaceAll('stroke-width="10"', 'stroke-width="18"').replaceAll('stroke-width="8"', 'stroke-width="16"')}</svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage();
async function render(svg, size, file, transparent = false) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(out, file), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
}
await render(full(), 512, 'icon-512.png');
await render(full(), 192, 'icon-192.png');
await render(full(), 180, 'apple-touch-icon.png');
await render(full(80), 512, 'maskable-512.png');
await render(badge, 96, 'badge-96.png', true);
await browser.close();
console.log('icons written to', out);
