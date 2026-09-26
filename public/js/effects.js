// Special celebrations for some quiz answers: big-pixel 90s scenes, plus smooth ones in gold
// (Niccolò) and sweet pink (Beatrice). Loaded only when needed; skipped when the phone asks
// for less motion.
import { audio } from './util.js';

export const EFFECTS = {
  drago: '🐉 Drago sputafuoco',
  anelli: "💍 Pioggia di anelli d'oro",
  ballo: "🕺 Ballerino anni '80",
  mare: '🏖️ Bamboletta al mare',
  borsa: '🔔 Campana della borsa',
  fulmine: '⚡ Fulmini ad alta tensione',
  brindisi: '🥂 Brindisi',
  viaggio: '✈️ Aereo con striscione',
  macellaio: '🔪 Macellaio al lavoro',
  trattore: '🚜 Trattore stile videogioco',
  campanello: "🛎️ Campanello d'oro",
  medaglie: "🥇 Tre medaglie d'oro",
  gattina: '🐱 Gattina DJ',
  racchetta: '🎾 Racchetta rosa',
  sveglia: '⏰ Sveglia kawaii',
  auto: '🚗 Macchinina rosa',
  aeroplanini: '💞 Aeroplanini a cuore',
};

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function overlay(cls, html = '') {
  const el = document.createElement('div');
  el.className = `fx ${cls}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

function fullCanvas(parent) {
  const c = document.createElement('canvas');
  c.className = 'fx-canvas';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = window.innerWidth * dpr;
  c.height = window.innerHeight * dpr;
  parent.prepend(c);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  return g;
}

/** requestAnimationFrame loop until step() returns false. */
function loop(step) {
  return new Promise((resolve) => {
    const frame = (now) => (step(now) === false ? resolve() : requestAnimationFrame(frame));
    requestAnimationFrame(frame);
  });
}

async function typeText(el, text, speed = 32) {
  for (let i = 1; i <= text.length; i++) {
    el.textContent = text.slice(0, i);
    await wait(speed);
  }
}

/* ------------------------------------------------------------------ */
/* Fire dragon                                                         */
/* ------------------------------------------------------------------ */

const DRAGON = `<svg viewBox="0 0 260 240" class="fx-dragon-svg">
  <g stroke="#6e3208" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
    <g class="fx-wing back">
      <path d="M108 112 Q74 64 26 16 Q44 44 36 60 Q60 58 54 80 Q78 78 72 100 Q92 96 98 120 Z" fill="#1d7f93"/>
      <path d="M108 112 Q74 64 26 16" fill="none" stroke="#f07f23" stroke-width="8"/>
    </g>
    <g class="fx-wing front">
      <path d="M132 108 Q152 60 208 12 Q192 42 200 58 Q176 60 182 80 Q160 80 164 100 Q148 100 146 118 Z" fill="#23909f"/>
      <path d="M132 108 Q152 60 208 12" fill="none" stroke="#f07f23" stroke-width="8"/>
    </g>
    <path d="M96 178 Q42 196 30 156 Q24 132 40 118" fill="none" stroke="#f07f23" stroke-width="18"/>
    <g class="fx-tailfire">
      <path d="M40 122 Q16 98 36 64 Q40 90 54 94 Q54 112 40 122 Z" fill="#ff8a1c" stroke="#e05412"/>
      <path d="M41 116 Q30 100 38 82 Q44 98 50 100 Q48 110 41 116 Z" fill="#ffd84a" stroke="none"/>
    </g>
    <ellipse cx="98" cy="196" rx="18" ry="22" fill="#e8741d"/>
    <path d="M88 120 Q84 90 116 88 Q150 88 156 128 Q164 176 132 200 Q104 210 88 190 Q72 160 88 120 Z" fill="#f28a2a"/>
    <path d="M118 104 Q146 110 148 150 Q150 188 126 196 Q108 196 106 170 Q100 130 118 104 Z" fill="#f7da97" stroke-width="2"/>
    <ellipse cx="140" cy="198" rx="18" ry="21" fill="#f28a2a"/>
    <ellipse cx="100" cy="216" rx="21" ry="8" fill="#e8741d"/>
    <ellipse cx="146" cy="218" rx="21" ry="8" fill="#f28a2a"/>
    <path d="M161 214 l6 1.5 l-6 2.5 z M161 220 l5 1 l-5 2 z M115 212 l6 1.5 l-6 2.5 z" fill="#fff8ec" stroke-width="1.2"/>
    <path d="M146 136 Q170 138 176 156" fill="none" stroke="#f28a2a" stroke-width="12"/>
    <path d="M177 153 l5 2.5 l-5 2 z" fill="#fff8ec" stroke-width="1.2"/>
    <path d="M120 104 Q126 72 158 64" fill="none" stroke="#f28a2a" stroke-width="26"/>
    <path d="M157 46 L124 24 L160 38 Z M151 56 L114 46 L152 62 Z" fill="#e8741d"/>
    <path class="fx-mouth" d="M178 74 L232 68 L226 86 L186 88 Z" fill="#6b1510" stroke-width="2"/>
    <g class="fx-jaw">
      <path d="M170 80 Q186 80 204 74 L230 72 Q234 80 224 84 L200 88 Q182 92 170 86 Z" fill="#f28a2a"/>
    </g>
    <path d="M146 62 Q146 36 172 36 Q196 36 206 52 L228 58 Q237 62 232 72 L204 76 Q186 82 168 82 Q146 82 146 62 Z" fill="#f28a2a"/>
    <ellipse cx="185" cy="53" rx="7.5" ry="6.5" fill="#fff" stroke-width="2"/>
    <circle cx="187" cy="54" r="3.6" fill="#1b2a4a" stroke="none"/>
    <circle cx="188.3" cy="52.6" r="1.1" fill="#fff" stroke="none"/>
    <path d="M174 42 L195 48" fill="none" stroke-width="3.4"/>
    <circle cx="222" cy="61" r="1.8" fill="#6e3208" stroke="none"/>
  </g>
</svg>`;

async function dragon() {
  const fx = overlay(
    'fx-dragon',
    `<div class="fx-heat"></div><div class="fx-dragon-body">${DRAGON}</div>
     <div class="fx-battle"><span></span><i>▼</i></div>`,
  );
  const g = fullCanvas(fx);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const body = fx.querySelector('.fx-dragon-body');
  const svg = fx.querySelector('svg');
  const parts = [];
  let firing = false;
  let done = false;

  const burn = loop(() => {
    g.clearRect(0, 0, W, H);
    if (firing) {
      const r = svg.getBoundingClientRect();
      const k = r.width / 260;
      const mx = r.left + 232 * k;
      const my = r.top + 76 * k;
      const aim = W > H ? -0.12 : -0.46; // phones: up and across the screen
      const speed = Math.max(W, H) / 52;
      for (let i = 0; i < 14; i++) {
        const a = aim + (Math.random() - 0.5) * 0.36;
        const v = speed * (0.75 + Math.random() * 0.5);
        parts.push({ x: mx, y: my, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, max: 38 + Math.random() * 22, r: 5 * k + 4 });
      }
    }
    g.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t++;
      const f = p.t / p.max;
      if (f >= 1) {
        parts.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.975;
      p.vy = p.vy * 0.975 - 0.12;
      p.r += 1.1;
      const a = 1 - f * f;
      // Additive blending: keep each puff faint so the flame stays orange instead of white.
      g.fillStyle =
        f < 0.06
          ? `rgba(255,240,190,${a * 0.7})`
          : f < 0.22
            ? `rgba(255,190,50,${a * 0.45})`
            : f < 0.5
              ? `rgba(255,110,20,${a * 0.38})`
              : `rgba(190,40,15,${a * 0.3})`;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    return !(done && !parts.length);
  });

  await wait(480);
  typeText(fx.querySelector('.fx-battle span'), 'CHARIZARD usa LANCIAFIAMME!');
  await wait(450);
  fx.classList.add('firing');
  document.getElementById('view')?.classList.add('fx-shake');
  firing = true;
  await wait(1700);
  firing = false;
  document.getElementById('view')?.classList.remove('fx-shake');
  fx.classList.remove('firing');
  await wait(500);
  body.classList.add('leaving');
  fx.classList.add('leaving');
  done = true;
  await Promise.all([burn, wait(700)]);
  fx.remove();
}

/* ------------------------------------------------------------------ */
/* Gold rings                                                          */
/* ------------------------------------------------------------------ */

async function rings() {
  const fx = overlay('fx-rings');
  const g = fullCanvas(fx);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const list = Array.from({ length: 64 }, () => {
    const r = 9 + Math.random() * 17;
    return {
      x: Math.random() * W,
      y: -r * 2 - Math.random() * H * 0.9,
      r,
      vy: 2.2 + Math.random() * 2.6 + r / 12,
      sway: Math.random() * Math.PI * 2,
      spin: Math.random() * Math.PI * 2,
      vs: 0.05 + Math.random() * 0.08,
      tilt: (Math.random() - 0.5) * 0.6,
    };
  });
  const start = performance.now();
  await loop((now) => {
    const age = now - start;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = Math.max(0, Math.min(1, (4200 - age) / 500));
    for (const p of list) {
      p.y += p.vy;
      p.sway += 0.03;
      p.spin += p.vs;
      const x = p.x + Math.sin(p.sway) * 14;
      const rx = Math.max(p.r * 0.14, p.r * Math.abs(Math.cos(p.spin)));
      g.save();
      g.translate(x, p.y);
      g.rotate(p.tilt);
      g.lineWidth = p.r * 0.34;
      g.strokeStyle = '#b8860b';
      g.beginPath();
      g.ellipse(0, 0, rx, p.r, 0, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = p.r * 0.2;
      g.strokeStyle = '#f5c542';
      g.stroke();
      g.lineWidth = p.r * 0.08;
      g.strokeStyle = '#fff4bf';
      g.beginPath();
      g.ellipse(0, 0, rx, p.r, 0, Math.PI * 1.05, Math.PI * 1.55);
      g.stroke();
      // Now and then a glint.
      if (Math.sin(p.spin * 1.7) > 0.96) {
        g.fillStyle = '#fffbe6';
        const s = p.r * 0.55;
        g.beginPath();
        g.moveTo(-rx, -s);
        g.quadraticCurveTo(-rx, 0, -rx + s, 0);
        g.quadraticCurveTo(-rx, 0, -rx, s);
        g.quadraticCurveTo(-rx, 0, -rx - s, 0);
        g.quadraticCurveTo(-rx, 0, -rx, -s);
        g.fill();
      }
      g.restore();
    }
    return age < 4200;
  });
  fx.remove();
}

/* ------------------------------------------------------------------ */
/* 8-bit dancer                                                        */
/* ------------------------------------------------------------------ */

const PAL = {
  hair: '#141414',
  skin: '#f0c090',
  eye: '#101010',
  lips: '#b0413e',
  jacket: '#1d1d22',
  lapel: '#4a4a55',
  tee: '#ffffff',
  belt: '#5a3a1a',
  jeans: '#2f5fa8',
  jeansHi: '#4677c4',
  shoes: '#0b0b0b',
};

// Rectangles in pixel units: [colour, x, y, w, h]
const HEAD = [
  ['hair', 8, 0, 8, 1],
  ['hair', 6, 1, 11, 2],
  ['skin', 7, 3, 8, 5],
  ['hair', 6, 3, 1, 3],
  ['hair', 15, 3, 1, 3],
  ['lapel', 9, 1, 5, 1],
  ['eye', 9, 5, 1, 1],
  ['eye', 12, 5, 1, 1],
  ['lips', 10, 7, 2, 1],
  ['skin', 10, 8, 2, 1],
];
const TORSO = [
  ['jacket', 6, 9, 10, 9],
  ['tee', 9, 9, 4, 8],
  ['lapel', 8, 9, 1, 6],
  ['lapel', 13, 9, 1, 6],
  ['belt', 6, 18, 10, 1],
];
const LEGS = [
  ['jeans', 6, 19, 4, 11],
  ['jeans', 12, 19, 4, 11],
  ['jeansHi', 7, 19, 1, 11],
  ['jeansHi', 13, 19, 1, 11],
  ['shoes', 5, 30, 5, 2],
  ['shoes', 12, 30, 5, 2],
];
const WIDE_LEGS = [
  ['jeans', 5, 19, 4, 6],
  ['jeans', 4, 25, 4, 5],
  ['jeans', 13, 19, 4, 6],
  ['jeans', 14, 25, 4, 5],
  ['jeansHi', 6, 19, 1, 6],
  ['jeansHi', 14, 19, 1, 6],
  ['shoes', 2, 30, 6, 2],
  ['shoes', 14, 30, 6, 2],
];
const arm = (cells, hand) => [...cells.map(([x, y]) => ['jacket', x, y, 2, 2]), ['skin', hand[0], hand[1], 2, 2]];
const POSES = [
  // Point up to the right, other hand on the hip.
  [...arm([[16, 9], [17, 7], [18, 5], [19, 3]], [20, 1]), ...arm([[4, 9], [4, 11], [4, 13]], [5, 15]), ...LEGS],
  // Point down to the left.
  [...arm([[4, 9], [3, 11], [2, 13], [1, 15]], [0, 17]), ...arm([[16, 9], [16, 11], [16, 13]], [15, 15]), ...LEGS],
  // Both arms up.
  [...arm([[4, 8], [3, 6], [2, 4]], [1, 2]), ...arm([[16, 8], [17, 6], [18, 4]], [19, 2]), ...LEGS],
  // Arms out, legs wide.
  [...arm([[4, 10], [2, 10], [0, 10]], [-2, 10]), ...arm([[16, 10], [18, 10], [20, 10]], [22, 10]), ...WIDE_LEGS],
];
const STEPS = [0, 1, 0, 1, 2, 3, 2, 3, 0, 1, 0, 1, 2, 3, 2, 3];

async function dance() {
  const fx = overlay(
    'fx-dance',
    `<div class="fx-sun"></div><div class="fx-floor"></div><div class="fx-scan"></div>
     <div class="fx-arcade top">★ PERFECT! ★</div><div class="fx-arcade bottom">DANCE BONUS<br>+1000</div>`,
  );
  const g = fullCanvas(fx);
  g.imageSmoothingEnabled = false;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const s = Math.max(4, Math.floor(Math.min((W * 0.62) / 26, (H * 0.42) / 34)));
  const baseX = Math.round(W / 2 - 11 * s);
  const baseY = Math.round(H * 0.66 - 32 * s);
  const draw = (pose, dx, hop) => {
    g.clearRect(0, 0, W, H);
    const ox = baseX + dx * s;
    const oy = baseY - hop * s;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(ox + 3 * s, baseY + 32 * s, 16 * s, s);
    for (const [c, x, y, w, h] of [...HEAD, ...TORSO, ...POSES[pose]]) {
      g.fillStyle = PAL[c];
      g.fillRect(ox + x * s, oy + y * s, w * s, h * s);
    }
  };
  requestAnimationFrame(() => fx.classList.add('on'));
  for (let i = 0; i < STEPS.length; i++) {
    const pose = STEPS[i];
    draw(pose, pose === 1 ? -1 : pose === 0 ? 1 : 0, pose === 2 ? 2 : i % 2);
    await wait(165);
  }
  fx.classList.remove('on');
  await wait(350);
  fx.remove();
}

/* ------------------------------------------------------------------ */
/* Shared: big-pixel sprites and a synthesized bell                    */
/* ------------------------------------------------------------------ */

/** Draw [colour, x, y, w, h] rectangles, in units of s pixels, at (ox, oy). */
function sprite(g, rects, pal, ox, oy, s) {
  for (const [c, x, y, w, h] of rects) {
    g.fillStyle = pal[c];
    g.fillRect(Math.round(ox + x * s), Math.round(oy + y * s), w * s, h * s);
  }
}

/** A church-bell "dong": a few decaying partials, no sound files needed. */
function bell(at = 0, freq = 196) {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const out = ctx.createGain();
  out.gain.value = 0.22;
  out.connect(ctx.destination);
  for (const [ratio, level, decay] of [[0.5, 0.5, 3.2], [1, 1, 2.6], [2, 0.5, 1.8], [2.76, 0.35, 1.3], [5.4, 0.18, 0.7]]) {
    const o = ctx.createOscillator();
    const env = ctx.createGain();
    o.frequency.value = freq * ratio;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(env).connect(out);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
}

/* ------------------------------------------------------------------ */
/* At the sea: she lifts her sunglasses and glares at you               */
/* ------------------------------------------------------------------ */

const DOLL_PAL = {
  hair: '#f7d774',
  hairD: '#d9aa3a',
  hairL: '#fff3b0',
  skin: '#f8cfa8',
  skinD: '#e7a984',
  suit: '#ff5470',
  suitD: '#d63a58',
  dot: '#ffffff',
  glass: '#15151c',
  shine: '#6b6b8e',
  white: '#ffffff',
  iris: '#2f6fd1',
  lash: '#4a2f1d',
  brow: '#b07d2a',
  mouth: '#c93d4b',
  blush: '#ff9aa2',
  anger: '#e8323c',
};
const DOLL_BASE = [
  ['hair', 10, 2, 12, 1],
  ['hair', 8, 3, 16, 1],
  ['hair', 7, 4, 18, 2],
  ['hair', 6, 6, 20, 17],
  ['hair', 5, 9, 2, 15],
  ['hair', 25, 9, 2, 15],
  ['hairD', 5, 21, 3, 4],
  ['hairD', 24, 21, 3, 4],
  ['skin', 9, 7, 14, 12],
  ['skin', 10, 19, 12, 1],
  ['skin', 12, 20, 8, 1],
  ['skinD', 14, 21, 4, 1],
  ['skin', 14, 22, 4, 1],
  ['hair', 9, 6, 14, 2],
  ['hair', 9, 8, 4, 1],
  ['hair', 19, 8, 4, 1],
  ['hair', 9, 9, 2, 1],
  ['hair', 21, 9, 2, 1],
  ['hairL', 12, 3, 6, 1],
  ['skin', 8, 23, 16, 2],
  ['skin', 6, 24, 3, 8],
  ['suit', 10, 25, 12, 7],
  ['suit', 11, 23, 2, 2],
  ['suit', 19, 23, 2, 2],
  ['skin', 15, 25, 2, 1],
  ['suitD', 10, 31, 12, 1],
  ['dot', 12, 27, 1, 1],
  ['dot', 18, 28, 1, 1],
  ['dot', 14, 30, 1, 1],
  ['dot', 20, 26, 1, 1],
];
const ARM_DOWN = [['skin', 23, 24, 3, 8]];
const GLASSES = (y) => [
  ['glass', 9, y, 14, 1],
  ['glass', 10, y, 5, 4],
  ['glass', 17, y, 5, 4],
  ['shine', 11, y + 1, 2, 1],
  ['shine', 18, y + 1, 2, 1],
];
const DOLL_FRAMES = [
  // Sunbathing, glasses on, a smug little smile.
  [...ARM_DOWN, ...GLASSES(11), ['mouth', 14, 17, 4, 1], ['mouth', 18, 16, 1, 1]],
  // Lifting the glasses.
  [
    ...GLASSES(8),
    ['white', 11, 12, 3, 2],
    ['white', 18, 12, 3, 2],
    ['iris', 12, 13, 2, 1],
    ['iris', 18, 13, 2, 1],
    ['skin', 24, 13, 3, 11],
    ['skin', 22, 9, 3, 4],
    ['mouth', 15, 17, 2, 1],
  ],
  // Glasses on her head, and the look.
  [
    ...ARM_DOWN,
    ...GLASSES(3),
    ['white', 11, 12, 3, 2],
    ['white', 18, 12, 3, 2],
    ['iris', 12, 13, 2, 1],
    ['iris', 18, 13, 2, 1],
    ['lash', 11, 12, 3, 1],
    ['lash', 18, 12, 3, 1],
    ['brow', 10, 10, 2, 1],
    ['brow', 12, 11, 2, 1],
    ['brow', 20, 10, 2, 1],
    ['brow', 18, 11, 2, 1],
    ['mouth', 15, 17, 2, 1],
    ['mouth', 14, 18, 1, 1],
    ['mouth', 17, 18, 1, 1],
    ['blush', 10, 15, 2, 1],
    ['blush', 20, 15, 2, 1],
    ['anger', 24, 3, 1, 2],
    ['anger', 26, 3, 1, 2],
    ['anger', 23, 4, 1, 1],
    ['anger', 27, 4, 1, 1],
    ['anger', 24, 6, 1, 1],
    ['anger', 26, 6, 1, 1],
  ],
];

function beachBackground(g, W, H, s) {
  const horizon = Math.round(H * 0.46);
  const shore = Math.round(H * 0.62);
  g.fillStyle = '#8fd3ff';
  g.fillRect(0, 0, W, horizon);
  g.fillStyle = '#b8e6ff';
  g.fillRect(0, horizon - 3 * s, W, 3 * s);
  // Pixel sun.
  const cx = Math.round(W * 0.8);
  const cy = Math.round(H * 0.13);
  g.fillStyle = '#ffe066';
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 17) g.fillRect(cx + x * s, cy + y * s, s, s);
  g.fillStyle = '#2f9bd6';
  g.fillRect(0, horizon, W, shore - horizon);
  g.fillStyle = '#bfe9ff';
  for (let i = 0; i < 14; i++) g.fillRect(((i * 97) % W) - (i % 3) * s, horizon + ((i * 53) % Math.max(1, shore - horizon - s)), 3 * s, s);
  g.fillStyle = '#f3d89a';
  g.fillRect(0, shore, W, H - shore);
  g.fillStyle = '#e0bf7a';
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 30; i++) g.fillRect(Math.floor(rnd() * W), shore + 2 * s + Math.floor(rnd() * Math.max(1, H - shore - 4 * s)), s, s);
  // Beach umbrella on the left.
  const ux = Math.round(Math.max(W * 0.18, 9 * s));
  const uy = Math.round(H * 0.3);
  g.fillStyle = '#6b4a2a';
  g.fillRect(ux, uy, s, shore - uy + 4 * s);
  for (let r = 0; r < 4; r++) {
    const half = 2 + r * 2; // narrow on top, wide at the bottom
    for (let c = -half; c < half; c++) {
      g.fillStyle = Math.floor((c + 20) / 2) % 2 ? '#ff5470' : '#ffffff';
      g.fillRect(ux + c * s, uy - (4 - r) * s, s, s);
    }
  }
}

async function beach() {
  const fx = overlay('fx-beach', '<div class="fx-bubble"><span></span></div>');
  const g = fullCanvas(fx);
  g.imageSmoothingEnabled = false;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const s = Math.max(5, Math.floor(Math.min(W / 34, (H * 0.62) / 32)));
  const ox = Math.round(W / 2 - 16 * s);
  const restY = Math.round(H - 32 * s - 18);
  const bubble = fx.querySelector('.fx-bubble');
  bubble.style.bottom = `${H - restY + 2 * s}px`;
  const start = performance.now();
  requestAnimationFrame(() => fx.classList.add('on'));
  await loop((now) => {
    const t = now - start;
    const rise = Math.min(1, t / 450);
    const sink = t > 3300 ? Math.min(1, (t - 3300) / 400) : 0;
    const y = restY + (1 - (1 - (1 - rise) ** 3)) * 30 * s + sink * 34 * s;
    const frame = t < 1150 ? 0 : t < 1450 ? 1 : 2;
    beachBackground(g, W, H, s);
    sprite(g, [...DOLL_BASE, ...DOLL_FRAMES[frame]], DOLL_PAL, ox, y, s);
    return t < 3750;
  });
  fx.remove();
}

async function beachWithWords() {
  const done = beach();
  await wait(1500);
  const box = document.querySelector('.fx-beach .fx-bubble');
  if (box) {
    box.classList.add('on');
    typeText(box.querySelector('span'), 'EHI! MI FAI OMBRA!');
  }
  await done;
}

/* ------------------------------------------------------------------ */
/* Stock exchange: the opening bell and a rocketing chart               */
/* ------------------------------------------------------------------ */

async function market() {
  const fx = overlay(
    'fx-market',
    `<div class="fx-market-head"><small>OPENING BELL</small><div class="fx-bell">🔔</div><b class="fx-dong">DONG!</b>
       <div class="fx-quote">NB <i>▲ +1704%</i></div></div>
     <div class="fx-ticker"><span>NB ▲ +1704% · SPOSI ▲ +∞ · AMORE ▲ +100% · BORSA DEI SÌ ▲ +17.04 · CONFETTI ▲ +250% · BOUQUET ▲ +42% · NB ▲ +1704% · SPOSI ▲ +∞ · AMORE ▲ +100% ·</span></div>`,
  );
  const g = fullCanvas(fx);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const n = 16;
  const top = H * 0.46;
  const bottom = H * 0.84;
  const cw = (W * 0.86) / n;
  const x0 = W * 0.07;
  // An exponential climb with a couple of red days along the way.
  const closes = Array.from({ length: n }, (_, i) => 0.06 + 0.94 * ((Math.exp(i / 4.2) - 1) / (Math.exp((n - 1) / 4.2) - 1)));
  closes[4] -= 0.05;
  closes[9] -= 0.07;
  const yOf = (v) => bottom - v * (bottom - top);
  bell(0.25);
  bell(1.25);
  setTimeout(() => fx.classList.add('dong'), 250);
  setTimeout(() => fx.classList.remove('dong'), 700);
  setTimeout(() => fx.classList.add('dong'), 1250);
  requestAnimationFrame(() => fx.classList.add('on'));
  const start = performance.now();
  await loop((now) => {
    const t = now - start;
    const shown = Math.min(n, Math.floor(t / 90) + 1);
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(120,170,255,0.12)';
    g.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const y = top + ((bottom - top) * i) / 6;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(W - x0, y);
      g.stroke();
    }
    for (let i = 0; i < shown; i++) {
      const open = i ? closes[i - 1] : 0.02;
      const close = closes[i];
      const up = close >= open;
      const x = x0 + i * cw + cw * 0.2;
      g.fillStyle = up ? '#1fd17a' : '#ff4d5e';
      g.fillRect(x + cw * 0.28, yOf(Math.max(open, close) + 0.03), 2, yOf(Math.min(open, close) - 0.02) - yOf(Math.max(open, close) + 0.03));
      g.fillRect(x, yOf(Math.max(open, close)), cw * 0.6, Math.max(3, Math.abs(yOf(open) - yOf(close))));
    }
    g.save();
    g.shadowColor = '#1fd17a';
    g.shadowBlur = 14;
    g.strokeStyle = '#7dffb5';
    g.lineWidth = 3;
    g.beginPath();
    for (let i = 0; i < shown; i++) {
      const x = x0 + i * cw + cw * 0.5;
      if (i) g.lineTo(x, yOf(closes[i]));
      else g.moveTo(x, yOf(closes[i]));
    }
    g.stroke();
    g.restore();
    return t < 3300;
  });
  fx.classList.remove('on');
  await wait(300);
  fx.remove();
}

/* ------------------------------------------------------------------ */
/* High voltage: lightning and a battery charging to 100%              */
/* ------------------------------------------------------------------ */

/** A jagged bolt with a few branches, as polylines (so glow and core follow the same path). */
function boltPaths(x, y, len, angle, depth = 0, out = []) {
  const pts = [[x, y]];
  let cx = x;
  let cy = y;
  for (let i = 0; i < 10; i++) {
    const a = angle + (Math.random() - 0.5) * 1.1;
    cx += Math.cos(a) * (len / 10);
    cy += Math.sin(a) * (len / 10);
    pts.push([cx, cy]);
    if (depth < 2 && Math.random() < 0.18) boltPaths(cx, cy, len * 0.45, angle + (Math.random() < 0.5 ? -0.7 : 0.7), depth + 1, out);
  }
  out.push({ pts, depth });
  return out;
}

function strokeBolt(g, paths, width) {
  for (const { pts, depth } of paths) {
    g.lineWidth = width * 0.6 ** depth;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
}

async function storm() {
  const fx = overlay(
    'fx-storm',
    `<div class="fx-flash"></div>
     <div class="fx-volt"><b>⚡ ALTA TENSIONE ⚡</b>
       <div class="fx-battery"><i></i><i></i><i></i><i></i><i></i></div><small>CARICA 100%</small></div>`,
  );
  const g = fullCanvas(fx);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const flash = fx.querySelector('.fx-flash');
  const cells = fx.querySelectorAll('.fx-battery i');
  let running = true;
  // Bolts fade out slowly instead of vanishing.
  const fade = loop(() => {
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,0.09)';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    return running;
  });
  requestAnimationFrame(() => fx.classList.add('on'));
  for (let i = 0; i < cells.length; i++) {
    await wait(i ? 330 : 150);
    const x = W * (0.12 + Math.random() * 0.76);
    const angle = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const paths = boltPaths(x, -10, H * (0.45 + Math.random() * 0.2), angle);
    g.strokeStyle = 'rgba(126,200,255,0.55)';
    g.shadowColor = '#7ec8ff';
    g.shadowBlur = 30;
    strokeBolt(g, paths, 10);
    g.strokeStyle = '#ffffff';
    g.shadowBlur = 12;
    strokeBolt(g, paths, 3.5);
    g.restore();
    flash.classList.remove('go');
    void flash.offsetWidth;
    flash.classList.add('go');
    cells[i].classList.add('lit');
  }
  fx.classList.add('charged');
  await wait(1100);
  running = false;
  await fade;
  fx.classList.remove('on');
  await wait(300);
  fx.remove();
}

/* ------------------------------------------------------------------ */
/* Cheers: two glasses of rosé, clinking                              */
/* ------------------------------------------------------------------ */

const GLASS = (wine) => [
  ['rim', 1, 0, 8, 1],
  ['glass', 1, 1, 8, 2],
  ['glass', 1, 3, 8, 1],
  [wine, 2, 3, 6, 1],
  ['glass', 2, 4, 6, 1],
  [wine, 3, 4, 4, 1],
  ['glass', 2, 5, 6, 1],
  [wine, 3, 5, 4, 1],
  ['glass', 3, 6, 4, 1],
  [wine, 4, 6, 2, 1],
  ['glass', 4, 7, 2, 1],
  ['shine', 2, 1, 1, 2],
  ['glass', 4, 8, 2, 5],
  ['glass', 2, 13, 6, 1],
  ['rim', 1, 14, 8, 1],
];
const GLASS_PAL = { rim: '#9fb6d0', glass: '#eaf4ff', shine: '#ffffff', rose: '#ff8fb1' };

async function cheers() {
  const fx = overlay('fx-cheers', '<div class="fx-cincin">CIN CIN!</div>');
  const g = fullCanvas(fx);
  g.imageSmoothingEnabled = false;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const s = Math.max(5, Math.floor(Math.min(W / 30, H / 40)));
  const cy = Math.round(H * 0.42);
  const pixelGlass = (wine) => {
    const c = document.createElement('canvas');
    c.width = 10;
    c.height = 15;
    sprite(c.getContext('2d'), GLASS(wine), GLASS_PAL, 0, 0, 1);
    return c;
  };
  const rose = pixelGlass('rose');
  const bubbles = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: H + Math.random() * H, r: 2 + Math.random() * 5, v: 1 + Math.random() * 2.5 }));
  const sparks = [];
  let clinked = false;
  requestAnimationFrame(() => fx.classList.add('on'));
  const start = performance.now();
  await loop((now) => {
    const t = now - start;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (const b of bubbles) {
      b.y -= b.v;
      g.beginPath();
      g.arc(b.x + Math.sin(b.y / 30) * 4, b.y, b.r, 0, Math.PI * 2);
      g.fill();
    }
    // Slide in, meet at 700 ms, bounce back a little.
    const k = Math.min(1, t / 700);
    const ease = 1 - (1 - k) ** 3;
    const back = t > 700 ? Math.sin(Math.min(1, (t - 700) / 250) * Math.PI) * 0.6 : 0;
    const gap = (1 - ease) * (W / 2 + 10 * s) + back * s;
    const tilt = 0.22 * ease;
    for (const [side, img] of [[-1, rose], [1, rose]]) {
      g.save();
      g.translate(W / 2 + side * (gap + 5 * s), cy);
      g.rotate(-side * tilt);
      g.imageSmoothingEnabled = false;
      g.drawImage(img, -5 * s, -7 * s, 10 * s, 15 * s);
      g.restore();
    }
    if (t >= 700 && !clinked) {
      clinked = true;
      fx.classList.add('clink');
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        sparks.push({ x: W / 2, y: cy - 6 * s, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, life: 26 });
      }
    }
    g.fillStyle = '#ffe066';
    for (const p of sparks) {
      if (p.life-- <= 0) continue;
      p.x += p.vx;
      p.y += p.vy;
      g.fillRect(Math.round(p.x), Math.round(p.y), s * 0.8, s * 0.8);
    }
    return t < 2800;
  });
  fx.classList.remove('on');
  await wait(300);
  fx.remove();
}

/* ------------------------------------------------------------------ */
/* Pixel helpers for the scenes below                                   */
/* ------------------------------------------------------------------ */

/** A filled pixel disc (or ring, with an inner radius) in units of s pixels. */
function disc(g, cx, cy, r, color, s = 1, inner = -1) {
  g.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (d <= r * r + r * 0.8 && (inner < 0 || d > inner * inner + inner * 0.8)) g.fillRect((cx + x) * s, (cy + y) * s, s, s);
    }
  }
}

function tabbarHeight() {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h')) || 64;
}

function arcadeText(g, text, x, y, size, fill, shadow) {
  g.font = `${size}px "Press Start 2P", ui-monospace, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (shadow) {
    g.fillStyle = shadow;
    g.fillText(text, x + size * 0.18, y + size * 0.18);
  }
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

/* ------------------------------------------------------------------ */
/* The butcher: a name on the apron, a cleaver, CHOP!                   */
/* ------------------------------------------------------------------ */

const BUTCHER_PAL = {
  hat: '#ffffff',
  hatD: '#d9e0ea',
  skin: '#f2c29b',
  skinD: '#d9a07a',
  hair: '#4a2f1d',
  eye: '#1a1a1a',
  mouth: '#9b3b3b',
  shirt: '#ffffff',
  shirtD: '#d7dee8',
  apron: '#8e1f2c',
  apronD: '#6d1621',
  steel: '#cfd6de',
  edge: '#ffffff',
  handle: '#5a3a1a',
  meat: '#d9474f',
  meatD: '#a8323a',
  fat: '#f6d2c4',
  wood: '#9b6a3c',
  woodD: '#7a4f2a',
};
const BUTCHER = [
  ['hat', 10, 0, 12, 3],
  ['hatD', 10, 2, 12, 1],
  ['hat', 9, 3, 14, 2],
  ['skin', 10, 5, 12, 9],
  ['skin', 9, 8, 1, 2],
  ['skin', 22, 8, 1, 2],
  ['hair', 12, 7, 3, 1],
  ['hair', 17, 7, 3, 1],
  ['eye', 13, 8, 2, 1],
  ['eye', 17, 8, 2, 1],
  ['skinD', 15, 9, 2, 2],
  ['hair', 12, 11, 8, 2],
  ['hair', 11, 12, 1, 1],
  ['hair', 20, 12, 1, 1],
  ['mouth', 14, 13, 4, 1],
  ['skinD', 14, 14, 4, 1],
  ['shirt', 7, 15, 18, 14],
  ['shirtD', 7, 15, 18, 1],
  ['apron', 10, 17, 12, 12],
  ['apron', 10, 15, 2, 2],
  ['apron', 20, 15, 2, 2],
  ['apronD', 10, 28, 12, 1],
  ['shirt', 4, 16, 3, 8],
];
const ARM_UP = [
  ['shirt', 25, 10, 3, 7],
  ['skin', 25, 8, 3, 2],
  ['handle', 26, 4, 1, 4],
  ['steel', 23, -1, 7, 5],
  ['edge', 23, -1, 7, 1],
];
const ARM_DOWN_CHOP = [
  ['shirt', 25, 15, 3, 6],
  ['shirt', 22, 21, 4, 2],
  ['skin', 19, 20, 3, 2],
  ['handle', 17, 20, 2, 1],
  ['steel', 13, 19, 5, 4],
  ['edge', 13, 22, 5, 1],
];

async function butcher({ label = '' } = {}) {
  const fx = overlay('fx-butcher', '<div class="fx-chop">CHOP!</div>');
  const g = fullCanvas(fx);
  g.imageSmoothingEnabled = false;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const s = Math.max(5, Math.floor(Math.min(W / 34, (H * 0.6) / 36)));
  const ox = Math.round(W / 2 - 16 * s);
  const oy = Math.round(H * 0.7 - 27 * s);
  const chopEl = fx.querySelector('.fx-chop');
  const bits = [];
  const text = (label || '').toUpperCase();
  let chops = 0;
  requestAnimationFrame(() => fx.classList.add('on'));
  const start = performance.now();
  await loop((now) => {
    const t = now - start;
    const phase = t % 620;
    const down = t > 300 && t < 2900 && phase > 380;
    if (down && chops < Math.floor((t - 300) / 620) + 1) {
      chops++;
      for (let i = 0; i < 9; i++) {
        bits.push({ x: ox + 16 * s, y: oy + 24 * s, vx: (Math.random() - 0.5) * 9, vy: -3 - Math.random() * 6, c: i % 3 ? 'meat' : 'fat' });
      }
      chopEl.classList.remove('go');
      void chopEl.offsetWidth;
      chopEl.classList.add('go');
      document.getElementById('view')?.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }],
        { duration: 120 },
      );
    }
    // Tiled wall and the counter.
    g.fillStyle = '#eef3f6';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#cfd9df';
    for (let y = 0; y < H; y += 4 * s) g.fillRect(0, y, W, Math.max(1, s / 3));
    for (let x = 0; x < W; x += 4 * s) g.fillRect(x, 0, Math.max(1, s / 3), H);
    sprite(g, BUTCHER, BUTCHER_PAL, ox, oy, s);
    if (text) {
      const size = Math.min(2.4 * s, (11 * s) / (text.length * 0.95));
      arcadeText(g, text, ox + 16 * s, oy + 20.8 * s, size, '#fff3d6');
    }
    sprite(g, down ? ARM_DOWN_CHOP : ARM_UP, BUTCHER_PAL, ox, oy, s);
    // The block and the meat on it.
    g.fillStyle = BUTCHER_PAL.woodD;
    g.fillRect(0, oy + 27 * s, W, H - oy - 27 * s);
    g.fillStyle = BUTCHER_PAL.wood;
    g.fillRect(0, oy + 27 * s, W, 2 * s);
    sprite(
      g,
      [
        ['meat', 9, 24, 14, 3],
        ['meatD', 9, 26, 14, 1],
        ['fat', 10, 24, 12, 1],
        ['fat', 21, 25, 2, 1],
        ['skin', 6, 23, 4, 2],
      ],
      BUTCHER_PAL,
      ox,
      oy,
      s,
    );
    for (const b of bits) {
      b.x += b.vx;
      b.y += b.vy;
      b.vy += 0.5;
      g.fillStyle = BUTCHER_PAL[b.c];
      g.fillRect(Math.round(b.x), Math.round(b.y), s, s);
    }
    return t < 3300;
  });
  fx.classList.remove('on');
  await wait(300);
  fx.remove();
}

/* ------------------------------------------------------------------ */
/* The tractor: small Metal Slug–style sprite driving across the screen */
/* ------------------------------------------------------------------ */

function drawTractor(g, frame) {
  const r = (c, x, y, w, h) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  // Trailer with hay bales (behind, on the left).
  r('#8b5a2b', 0, 26, 26, 4);
  r('#6b4420', 0, 29, 26, 1);
  for (const [x, y] of [[1, 18], [9, 18], [17, 18], [5, 11], [13, 11]]) {
    r('#e9c46a', x, y, 8, 8);
    r('#c9a44a', x, y + 3, 8, 1);
    r('#f4dc97', x, y, 8, 1);
  }
  r('#333', 26, 28, 6, 1);
  disc(g, 13, 34, 4, '#1d1d1d');
  disc(g, 13, 34, 2, '#9aa3ad');
  // Tractor body.
  const X = 30;
  r('#8e241c', X + 16, 26, 16, 4);
  r('#d23b2f', X + 16, 17, 20, 9);
  r('#f06a5a', X + 16, 17, 20, 1);
  r('#333', X + 35, 18, 2, 8);
  r('#ffe066', X + 36, 18, 1, 2);
  r('#444', X + 28, 6, 2, 11);
  r('#555', X + 27, 5, 4, 1);
  r('#d23b2f', X + 0, 16, 17, 4);
  r('#f06a5a', X + 0, 16, 17, 1);
  r('#2a2a2a', X + 5, 12, 6, 4);
  r('#333', X + 13, 10, 1, 7);
  r('#333', X + 11, 9, 5, 1);
  // The driver, waving.
  r('#3b2a1e', X + 6, 1, 5, 2);
  r('#f2c29b', X + 6, 3, 5, 4);
  r('#111', X + 7, 4, 4, 1);
  r('#ffffff', X + 6, 7, 6, 6);
  r('#f2c29b', X + 12, 8, 2, 2);
  if (frame % 2) r('#f2c29b', X + 3, 2, 2, 5);
  else r('#f2c29b', X + 2, 5, 2, 4);
  r('#2f5fa8', X + 6, 13, 6, 3);
  // Wheels: big rear, small front, spokes turning.
  disc(g, X + 9, 31, 8, '#1d1d1d');
  disc(g, X + 9, 31, 5, '#f2c230');
  disc(g, X + 9, 31, 2, '#8e241c');
  if (frame % 2) {
    r('#1d1d1d', X + 9, 27, 1, 3);
    r('#1d1d1d', X + 9, 33, 1, 3);
  } else {
    r('#1d1d1d', X + 5, 31, 3, 1);
    r('#1d1d1d', X + 11, 31, 3, 1);
  }
  disc(g, X + 31, 34, 5, '#1d1d1d');
  disc(g, X + 31, 34, 2, '#f2c230');
}

async function tractor() {
  const fx = overlay('fx-tractor', '<div class="fx-mission">MISSION<br>COMPLETE!</div>');
  const g = fullCanvas(fx);
  g.imageSmoothingEnabled = false;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const s = Math.max(2, Math.min(4, Math.floor(W / 110)));
  const ground = H - tabbarHeight() - 24;
  const sheet = document.createElement('canvas');
  sheet.width = 70;
  sheet.height = 40;
  const sg = sheet.getContext('2d');
  const smoke = [];
  const dust = [];
  const trip = 3600;
  requestAnimationFrame(() => fx.classList.add('on'));
  const start = performance.now();
  await loop((now) => {
    const t = now - start;
    const frame = Math.floor(t / 110);
    const x = -70 * s + ((W + 80 * s) * Math.min(1, t / trip));
    const y = ground - 39 * s + (frame % 2 ? -s : 0);
    g.clearRect(0, 0, W, H);
    // A strip of field to drive on.
    g.fillStyle = '#7a5230';
    g.fillRect(0, ground, W, 24);
    g.fillStyle = '#5c9e3a';
    g.fillRect(0, ground - s, W, 2 * s);
    for (let gx = (frame * 2) % 12; gx < W; gx += 12 * s) g.fillRect(gx, ground - 3 * s, s, 2 * s);
    if (frame % 3 === 0 && smoke.length < 60) smoke.push({ x: x + 59 * s, y: y + 4 * s, r: s * 1.2, a: 0.75 });
    if (frame % 2 === 0 && dust.length < 60) dust.push({ x: x + 30 * s, y: ground - s, vx: -1 - Math.random(), vy: -Math.random() * 1.5, a: 0.7 });
    for (const p of smoke) {
      p.y -= 0.9;
      p.x -= 0.6;
      p.r += 0.12;
      p.a -= 0.012;
      if (p.a > 0) disc(g, Math.round(p.x / s), Math.round(p.y / s), Math.round(p.r / s), `rgba(130,130,130,${p.a})`, s);
    }
    for (const p of dust) {
      p.x += p.vx;
      p.y += p.vy;
      p.a -= 0.02;
      if (p.a > 0) {
        g.fillStyle = `rgba(160,110,60,${p.a})`;
        g.fillRect(Math.round(p.x), Math.round(p.y), s, s);
      }
    }
    sg.clearRect(0, 0, 70, 40);
    drawTractor(sg, frame);
    g.drawImage(sheet, Math.round(x), Math.round(y), 70 * s, 40 * s);
    return t < trip + 300;
  });
  fx.classList.remove('on');
  await wait(300);
  fx.remove();
}

/* ------------------------------------------------------------------ */
/* A trip together: dunes, sea, a plane towing a banner                 */
/* ------------------------------------------------------------------ */

function islandBackground(g, W, H, s, t) {
  const horizon = Math.round(H * 0.5);
  g.fillStyle = '#79c7f2';
  g.fillRect(0, 0, W, horizon);
  g.fillStyle = '#a8dcf7';
  g.fillRect(0, horizon - 4 * s, W, 4 * s);
  disc(g, Math.round((W * 0.18) / s), Math.round((H * 0.14) / s), 4, '#ffe066', s);
  // Volcanic hills on the horizon.
  g.fillStyle = '#9c6b4e';
  for (let x = 0; x < W; x += s) {
    const h = Math.max(0, Math.sin(x / (W * 0.18)) * 7 + Math.sin(x / (W * 0.07)) * 3 + 2);
    g.fillRect(x, horizon - Math.round(h) * s, s, Math.round(h) * s);
  }
  g.fillStyle = '#2bb6c9';
  g.fillRect(0, horizon, W, Math.round(H * 0.14));
  g.fillStyle = '#c9f3f7';
  for (let i = 0; i < 10; i++) g.fillRect(((i * 83 + t * 0.04) % (W + 40)) - 20, horizon + ((i * 37) % Math.round(H * 0.12)), 3 * s, s);
  // Golden dunes.
  const top = horizon + Math.round(H * 0.14);
  g.fillStyle = '#f2d27e';
  g.fillRect(0, top, W, H - top);
  g.fillStyle = '#e4bd5f';
  for (let x = 0; x < W; x += s) {
    const h = Math.round(Math.max(0, Math.sin(x / (W * 0.22) + 1) * 6 + 4));
    g.fillRect(x, top + (12 - h) * s, s, s * 2);
  }
}

async function trip({ label = '' } = {}) {
  const fx = overlay('fx-trip');
  const g = fullCanvas(fx);
  g.imageSmoothingEnabled = false;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const s = Math.max(4, Math.floor(Math.min(W / 60, H / 90)));
  const words = (label || 'BUON VIAGGIO!').toUpperCase();
  const fontSize = Math.max(10, Math.round(s * 2.4));
  g.font = `${fontSize}px "Press Start 2P", ui-monospace, monospace`;
  const bannerW = g.measureText(words).width + 4 * s;
  const coupleX = Math.round(W * 0.66);
  const coupleY = Math.round(H * 0.74);
  const span = W + bannerW + 40 * s;
  requestAnimationFrame(() => fx.classList.add('on'));
  const start = performance.now();
  await loop((now) => {
    const t = now - start;
    islandBackground(g, W, H, s, t);
    // The plane flies right to left, towing the banner.
    const px = W + 4 * s - (span * Math.min(1, t / 3400));
    const py = Math.round(H * 0.24 + Math.sin(t / 300) * s);
    sprite(
      g,
      [
        ['body', 0, 2, 14, 3],
        ['body', -2, 3, 2, 1],
        ['wing', 5, 0, 4, 7],
        ['tail', 12, 0, 2, 2],
        ['glass', 1, 2, 3, 1],
        ['prop', -3, (Math.floor(t / 60) % 2) * 2 + 1, 1, 3],
      ],
      { body: '#ffffff', wing: '#e8445a', tail: '#e8445a', glass: '#3a7bd5', prop: '#555' },
      px,
      py,
      s,
    );
    g.strokeStyle = '#555';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(px + 14 * s, py + 3.5 * s);
    g.lineTo(px + 20 * s, py + 3.5 * s);
    g.stroke();
    const bx = px + 20 * s;
    for (let x = 0; x < bannerW; x += s) {
      const wave = Math.round(Math.sin((x + t * 0.25) / (6 * s)) * 0.8) * s;
      g.fillStyle = '#ffffff';
      g.fillRect(bx + x, py + wave, s, 7 * s);
      g.fillStyle = '#d9e2ea';
      g.fillRect(bx + x, py + wave + 6 * s, s, s);
    }
    g.font = `${fontSize}px "Press Start 2P", ui-monospace, monospace`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = '#e8445a';
    g.fillText(words, bx + 2 * s, py + 3.6 * s);
    // The two of them on the dune, and a heart.
    sprite(
      g,
      [
        ['hairB', 0, 0, 4, 2],
        ['skin', 0, 2, 4, 3],
        ['hairB', -1, 1, 1, 5],
        ['dress', 0, 5, 4, 6],
        ['skin', 4, 6, 2, 1],
        ['hairN', 7, 0, 4, 2],
        ['skin', 7, 2, 4, 3],
        ['shirt', 7, 5, 4, 4],
        ['legs', 7, 9, 4, 2],
      ],
      { hairB: '#f7d774', hairN: '#3b2a1e', skin: '#f6c9a0', dress: '#ff5470', shirt: '#ffffff', legs: '#2f5fa8' },
      coupleX,
      coupleY,
      s,
    );
    if (t > 900) {
      const hy = coupleY - 6 * s - Math.min(12, (t - 900) / 120) * s;
      sprite(g, [['h', 0, 0, 2, 1], ['h', 3, 0, 2, 1], ['h', -1, 1, 7, 2], ['h', 0, 3, 5, 1], ['h', 1, 4, 3, 1], ['h', 2, 5, 1, 1]], { h: '#e8323c' }, coupleX + 3 * s, hy, s);
    }
    return t < 3700;
  });
  fx.classList.remove('on');
  await wait(300);
  fx.remove();
}

/* ------------------------------------------------------------------ */
/* Smooth scenes: gold and cinematic for Niccolò, sweet pink for        */
/* Beatrice, both for the two of them                                   */
/* ------------------------------------------------------------------ */

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;
const easeOutBack = (t) => {
  const x = clamp01(t) - 1;
  return 1 + 2.70158 * x ** 3 + 1.70158 * x ** 2;
};
const easeInOut = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};

/** A four-pointed sparkle. */
function sparklePath(g, x, y, r) {
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.fill();
}

function heartPath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 0.62, y - s * 0.05, x - s * 0.34, y - s * 0.58, x, y - s * 0.2);
  g.bezierCurveTo(x + s * 0.34, y - s * 0.58, x + s * 0.62, y - s * 0.05, x, y + s * 0.35);
  g.closePath();
}

/** Metallic gold, lit from the upper left. */
function goldFill(g, x, y, r) {
  const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.05, x, y, r * 1.25);
  grad.addColorStop(0, '#fffbe0');
  grad.addColorStop(0.25, '#f5d77a');
  grad.addColorStop(0.62, '#d9a92e');
  grad.addColorStop(1, '#8a6412');
  return grad;
}

function caption(fx, text, tone) {
  const el = document.createElement('div');
  el.className = `fx-caption ${tone}`;
  el.textContent = text;
  fx.appendChild(el);
  return el;
}

/** Sparkles and hearts shared by the smooth scenes. */
function particles() {
  const list = [];
  return {
    burst(x, y, n, colors, { speed = 5, kind = 'spark', size = 8 } = {}) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, life: 40 + Math.random() * 30, age: 0, kind, size: size * (0.6 + Math.random() * 0.7), color: colors[i % colors.length] });
      }
    },
    rise(x, y, colors, kind = 'heart', size = 16) {
      list.push({ x, y, vx: (Math.random() - 0.5) * 0.6, vy: -1.2 - Math.random() * 1.6, life: 110, age: 0, kind, size: size * (0.6 + Math.random() * 0.8), color: colors[Math.floor(Math.random() * colors.length)], sway: Math.random() * 6 });
    },
    draw(g) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        if (++p.age > p.life) {
          list.splice(i, 1);
          continue;
        }
        p.x += p.vx + (p.sway ? Math.sin((p.age + p.sway * 10) / 12) * 0.6 : 0);
        p.y += p.vy;
        if (p.kind === 'spark') p.vy += 0.08;
        g.globalAlpha = Math.min(1, (p.life - p.age) / 25);
        g.fillStyle = p.color;
        if (p.kind === 'heart') {
          heartPath(g, p.x, p.y, p.size);
          g.fill();
        } else if (p.kind === 'note') {
          g.font = `${Math.round(p.size * 1.6)}px Inter, sans-serif`;
          g.textAlign = 'center';
          g.fillText(p.age % 60 < 30 ? '♪' : '♫', p.x, p.y);
        } else {
          sparklePath(g, p.x, p.y, p.size);
        }
      }
      g.globalAlpha = 1;
    },
  };
}

/** A small bright "ding" (reception bell), synthesized. */
function ding(at = 0, freq = 1568) {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const out = ctx.createGain();
  out.gain.value = 0.16;
  out.connect(ctx.destination);
  for (const [ratio, level, decay] of [[1, 1, 1.4], [2.76, 0.4, 0.7], [5.4, 0.15, 0.35]]) {
    const o = ctx.createOscillator();
    const env = ctx.createGain();
    o.frequency.value = freq * ratio;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(env).connect(out);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
}

/** Common frame for the smooth scenes: overlay, canvas, a loop, fade out. */
async function scene(cls, duration, draw) {
  const fx = overlay(`fx-smooth ${cls}`);
  const g = fullCanvas(fx);
  const W = window.innerWidth;
  const H = window.innerHeight;
  requestAnimationFrame(() => fx.classList.add('on'));
  const ctx = { fx, g, W, H, fx0: particles() };
  const start = performance.now();
  await loop((now) => {
    const t = now - start;
    g.clearRect(0, 0, W, H);
    draw(t, ctx);
    return t < duration;
  });
  fx.classList.remove('on');
  await wait(350);
  fx.remove();
}

/* ---- Gold: the reception bell --------------------------------------- */

function hotelBell({ label = '' } = {}) {
  const GOLD = ['#fff3b0', '#f5d77a', '#e0b545'];
  let cap;
  let dings = 0;
  const rings = [];
  ding(0.62);
  ding(1.02);
  return scene('fx-gold', 3300, (t, { fx, g, W, H, fx0 }) => {
    cap ||= caption(fx, label || 'Benvenuti', 'gold');
    const R = Math.min(W * 0.26, H * 0.16);
    const cx = W / 2;
    const baseY = H * 0.6 - (1 - easeOutBack(t / 600)) * H * 0.7;
    const due = t > 1020 ? 2 : t > 620 ? 1 : 0;
    if (due > dings) {
      dings = due;
      rings.push({ r: R * 1.05, a: 1 });
      fx0.burst(cx, baseY - R * 1.05, 18, GOLD, { speed: 6, size: 7 });
    }
    const pressed = (t > 620 && t < 740) || (t > 1020 && t < 1140);
    // Five stars, one at a time.
    for (let i = 0; i < 5; i++) {
      const k = easeOutBack((t - 1300 - i * 140) / 350);
      if (k <= 0) continue;
      const a = Math.PI * (1.15 + i * 0.175);
      const sx = cx + Math.cos(a) * R * 1.85;
      const sy = baseY - R * 0.45 + Math.sin(a) * R * 1.55;
      g.save();
      g.translate(sx, sy);
      g.scale(k, k);
      g.fillStyle = goldFill(g, 0, 0, R * 0.2);
      g.beginPath();
      for (let p = 0; p < 10; p++) {
        const rr = p % 2 ? R * 0.09 : R * 0.21;
        const aa = -Math.PI / 2 + (p * Math.PI) / 5;
        g.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
      }
      g.closePath();
      g.fill();
      g.restore();
    }
    for (const ring of rings) {
      ring.r += R * 0.05;
      ring.a -= 0.02;
      if (ring.a <= 0) continue;
      g.strokeStyle = `rgba(245,215,122,${ring.a})`;
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(cx, baseY - R * 0.4, ring.r, ring.r * 0.6, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // Base.
    const base = g.createLinearGradient(cx - R * 1.2, 0, cx + R * 1.2, 0);
    base.addColorStop(0, '#6e4e0c');
    base.addColorStop(0.5, '#d4a93c');
    base.addColorStop(1, '#6e4e0c');
    g.fillStyle = base;
    g.beginPath();
    g.roundRect(cx - R * 1.2, baseY, R * 2.4, R * 0.3, R * 0.08);
    g.fill();
    // Dome, rim and knob.
    g.fillStyle = goldFill(g, cx, baseY - R * 0.5, R);
    g.beginPath();
    g.ellipse(cx, baseY, R, R * 0.95, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillStyle = '#9c7414';
    g.fillRect(cx - R, baseY - R * 0.05, R * 2, R * 0.08);
    g.strokeStyle = 'rgba(255,255,240,0.7)';
    g.lineWidth = R * 0.05;
    g.beginPath();
    g.ellipse(cx, baseY, R * 0.78, R * 0.72, 0, Math.PI * 1.2, Math.PI * 1.45);
    g.stroke();
    const ky = baseY - R * 0.95 + (pressed ? R * 0.08 : 0);
    g.fillStyle = '#b8891f';
    g.fillRect(cx - R * 0.05, ky - R * 0.14, R * 0.1, R * 0.2);
    g.fillStyle = goldFill(g, cx, ky - R * 0.2, R * 0.13);
    g.beginPath();
    g.ellipse(cx, ky - R * 0.18, R * 0.16, R * 0.1, 0, 0, Math.PI * 2);
    g.fill();
    fx0.draw(g);
    if (t > 1300) cap.classList.add('show');
  });
}

/* ---- Gold: three medals --------------------------------------------- */

function medals({ label = '' } = {}) {
  const icons = Array.from(label && window.Intl?.Segmenter ? new Intl.Segmenter().segment(label) : label || '', (x) => x.segment ?? x)
    .filter((x) => x.trim())
    .slice(0, 3);
  while (icons.length < 3) icons.push('★');
  return scene('fx-gold', 3400, (t, { g, W, H, fx0 }) => {
    const R = Math.min(W * 0.13, 64);
    [0.2, 0.5, 0.8].forEach((pos, i) => {
      const x = W * pos;
      const t0 = t - i * 260;
      if (t0 < 0) return;
      const len = H * (0.3 + (i === 1 ? 0.06 : 0)) * easeOutBack(t0 / 700);
      const angle = 0.5 * Math.exp(-t0 / 900) * Math.cos(t0 / 170) * (i === 1 ? -1 : 1);
      g.save();
      g.translate(x, -10);
      g.rotate(angle);
      // Ribbon.
      // Two strips meeting at the medal.
      for (const [dx, col] of [[-R * 0.35, '#1f2f5c'], [R * 0.35, '#2a3f78']]) {
        const bottom = Math.sign(dx) * R * 0.08;
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(dx - R * 0.2, 0);
        g.lineTo(dx + R * 0.2, 0);
        g.lineTo(bottom + R * 0.12, len);
        g.lineTo(bottom - R * 0.12, len);
        g.closePath();
        g.fill();
      }
      g.fillStyle = '#e8c35a';
      g.fillRect(-R * 0.04, 0, R * 0.08, len);
      // Medal.
      const my = len + R * 0.95;
      g.fillStyle = '#b8891f';
      g.beginPath();
      g.ellipse(0, len + R * 0.05, R * 0.18, R * 0.1, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = goldFill(g, 0, my, R);
      g.beginPath();
      g.arc(0, my, R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(120,86,10,0.8)';
      g.lineWidth = R * 0.06;
      g.beginPath();
      g.arc(0, my, R * 0.8, 0, Math.PI * 2);
      g.stroke();
      // A glint sweeping across.
      g.save();
      g.beginPath();
      g.arc(0, my, R, 0, Math.PI * 2);
      g.clip();
      const sweep = ((t0 / 1400) % 1) * R * 4 - R * 2;
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.moveTo(sweep - R * 0.3, my - R);
      g.lineTo(sweep + R * 0.1, my - R);
      g.lineTo(sweep - R * 0.3, my + R);
      g.lineTo(sweep - R * 0.7, my + R);
      g.fill();
      g.restore();
      g.font = `${Math.round(R * 0.95)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#7a560c';
      g.fillText(icons[i], 0, my + R * 0.04);
      g.restore();
      if (t0 > 600 && t0 < 640) fx0.burst(x, len + R * 0.95, 10, ['#fff3b0', '#f5d77a'], { speed: 5, size: 6 });
    });
    fx0.draw(g);
  });
}

/* ---- Pink: the kawaii kitten DJ -------------------------------------- */

function kittenDJ({ label = '' } = {}) {
  let cap;
  let last = 0;
  const PINKS = ['#ff5c9a', '#ff8fbf', '#ffb3d1', '#c77dff'];
  return scene('fx-pink', 3600, (t, { fx, g, W, H, fx0 }) => {
    cap ||= caption(fx, label || '♪ Let’s dance ♪', 'pink');
    if (t > 250) cap.classList.add('show');
    const R = Math.min(W * 0.25, H * 0.15);
    const cx = W / 2;
    const cy = H * 0.56;
    const beat = (t % 500) / 500;
    // Light beams from the disco ball.
    g.save();
    g.translate(cx, H * 0.08);
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3 + Math.sin(t / 900) * 0.02);
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.22)' : 'rgba(255,140,190,0.18)';
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-R * 0.35, H);
      g.lineTo(R * 0.35, H);
      g.fill();
    }
    g.restore();
    // Disco ball.
    const br = R * 0.42;
    const ball = g.createRadialGradient(cx - br * 0.3, H * 0.08 - br * 0.3, 2, cx, H * 0.08, br);
    ball.addColorStop(0, '#ffffff');
    ball.addColorStop(0.5, '#ffd1e6');
    ball.addColorStop(1, '#d98ab0');
    g.fillStyle = ball;
    g.beginPath();
    g.arc(cx, H * 0.08, br, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 1;
    for (let k = -2; k <= 2; k++) {
      g.beginPath();
      g.ellipse(cx, H * 0.08, br, br * Math.abs(k) * 0.3 + 0.1, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(cx + ((k * br) / 3 + (t / 30) % (br / 3)), H * 0.08, Math.abs(Math.cos(k)) * br * 0.2 + 1, br, 0, 0, Math.PI * 2);
      g.stroke();
    }
    if (t - last > 140) {
      last = t;
      fx0.rise(Math.random() * W, H + 10, PINKS, Math.random() < 0.55 ? 'heart' : 'note', 16);
    }
    fx0.draw(g);
    // The kitten, bobbing to the beat.
    const bob = Math.sin(beat * Math.PI * 2);
    g.save();
    g.translate(cx, cy - Math.abs(bob) * 6);
    g.rotate(bob * 0.1);
    // Body and turntables.
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(0, R * 1.05, R * 0.62, R * 0.45, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffb3d1';
    g.beginPath();
    g.roundRect(-R * 1.2, R * 1.2, R * 2.4, R * 0.42, R * 0.12);
    g.fill();
    for (const dx of [-0.6, 0.6]) {
      g.save();
      g.translate(dx * R, R * 1.36);
      g.rotate(t / 150);
      g.fillStyle = '#3a2330';
      g.beginPath();
      g.ellipse(0, 0, R * 0.36, R * 0.13, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff5c9a';
      g.beginPath();
      g.ellipse(0, 0, R * 0.1, R * 0.04, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // Ears.
    for (const side of [-1, 1]) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(side * R * 0.95, -R * 0.25);
      g.quadraticCurveTo(side * R * 0.95, -R * 1.05, side * R * 0.35, -R * 0.72);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffc2dc';
      g.beginPath();
      g.moveTo(side * R * 0.82, -R * 0.38);
      g.quadraticCurveTo(side * R * 0.84, -R * 0.86, side * R * 0.48, -R * 0.66);
      g.closePath();
      g.fill();
    }
    // Head.
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#f2c3d6';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(0, 0, R, R * 0.84, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // Headphones.
    g.strokeStyle = '#ff7eb6';
    g.lineWidth = R * 0.12;
    g.beginPath();
    g.ellipse(0, -R * 0.05, R * 1.02, R * 0.92, 0, Math.PI * 1.08, Math.PI * 1.92);
    g.stroke();
    for (const side of [-1, 1]) {
      g.fillStyle = '#ff5c9a';
      g.beginPath();
      g.roundRect(side * R * 1.02 - R * 0.14, -R * 0.2, R * 0.28, R * 0.46, R * 0.12);
      g.fill();
    }
    // A big bow on one ear.
    g.save();
    g.translate(-R * 0.55, -R * 0.78);
    g.rotate(-0.35);
    g.fillStyle = '#ff4f9a';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.ellipse(side * R * 0.2, 0, R * 0.22, R * 0.15, side * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ff85b8';
    g.beginPath();
    g.arc(0, 0, R * 0.09, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // Face: sparkly eyes (happy arcs on the drop), blush, a little ω mouth.
    const happy = t > 1800;
    for (const side of [-1, 1]) {
      const ex = side * R * 0.38;
      const ey = R * 0.02;
      if (happy) {
        g.strokeStyle = '#3a2330';
        g.lineWidth = R * 0.06;
        g.beginPath();
        g.arc(ex, ey + R * 0.06, R * 0.13, Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
      } else {
        g.fillStyle = '#3a2330';
        g.beginPath();
        g.ellipse(ex, ey, R * 0.14, R * 0.18, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(ex - R * 0.05, ey - R * 0.07, R * 0.055, 0, Math.PI * 2);
        g.arc(ex + R * 0.05, ey + R * 0.06, R * 0.03, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(255,120,170,0.45)';
      g.beginPath();
      g.ellipse(side * R * 0.6, R * 0.3, R * 0.16, R * 0.09, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#d9b8c6';
      g.lineWidth = 2;
      for (const dy of [-0.08, 0.06]) {
        g.beginPath();
        g.moveTo(side * R * 0.72, R * (0.22 + dy));
        g.lineTo(side * R * 1.08, R * (0.18 + dy * 1.6));
        g.stroke();
      }
    }
    g.fillStyle = '#ffb347';
    g.beginPath();
    g.ellipse(0, R * 0.2, R * 0.06, R * 0.045, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3a2330';
    g.lineWidth = R * 0.035;
    for (const mx of [-R * 0.055, R * 0.055]) {
      g.beginPath();
      g.arc(mx, R * 0.28, R * 0.055, 0.1, Math.PI - 0.1);
      g.stroke();
    }
    g.restore();
  });
}

/* ---- Pink: a racket and a ball ----------------------------------- */

function pinkRacket({ label = '' } = {}) {
  let cap;
  const PINKS = ['#ff5c9a', '#ff8fbf', '#ffc2dc'];
  return scene('fx-pink', 3000, (t, { fx, g, W, H, fx0 }) => {
    cap ||= caption(fx, label || 'Punto!', 'pink');
    if (t > 1250) cap.classList.add('show');
    const floor = H * 0.78;
    g.strokeStyle = 'rgba(160,120,220,0.35)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, floor);
    g.lineTo(W, floor);
    g.moveTo(W / 2, floor);
    g.lineTo(W / 2, H);
    g.stroke();
    // Ball: hit at 500 ms, flies in an arc, bounces, leaves hearts behind.
    const L = Math.min(W * 0.34, H * 0.2);
    const hx = W * 0.2;
    const hy = floor - L * 0.9;
    let bx = hx + L * 0.35;
    let by = hy - L * 0.2;
    if (t > 500) {
      const k = (t - 500) / 1300;
      bx = hx + L * 0.35 + (W * 0.95 - hx) * k;
      by = k < 0.7 ? hy - Math.sin((k / 0.7) * Math.PI) * H * 0.3 + (floor - hy) * (k / 0.7) ** 2 : floor - Math.sin(((k - 0.7) / 0.3) * Math.PI) * H * 0.1;
      if (Math.floor(t / 60) !== Math.floor((t - 16) / 60)) fx0.rise(bx, by, PINKS, 'heart', 12);
    }
    fx0.draw(g);
    const br = L * 0.12;
    g.fillStyle = '#e8f25a';
    g.beginPath();
    g.arc(bx, by, br, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(bx - br * 0.9, by, br * 0.8, -0.9, 0.9);
    g.stroke();
    // Racket swinging.
    const swing = t < 380 ? -0.9 : t < 520 ? -0.9 + 1.6 * easeOut((t - 380) / 140) : 0.7 - 0.3 * easeOut((t - 520) / 600);
    g.save();
    g.translate(hx - L * 0.2, floor);
    g.rotate(swing);
    g.fillStyle = '#b84d7c';
    g.beginPath();
    g.roundRect(-L * 0.07, -L * 0.55, L * 0.14, L * 0.55, L * 0.05);
    g.fill();
    const head = g.createLinearGradient(-L * 0.4, -L * 1.4, L * 0.4, -L * 0.5);
    head.addColorStop(0, '#ffb3d1');
    head.addColorStop(1, '#ff5c9a');
    g.fillStyle = head;
    g.strokeStyle = '#d43d7c';
    g.lineWidth = L * 0.05;
    g.beginPath();
    g.ellipse(0, -L * 0.98, L * 0.4, L * 0.46, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let yy = -3; yy <= 3; yy++) {
      for (let xx = -3; xx <= 3; xx++) {
        if (xx * xx * 0.9 + yy * yy * 0.75 > 9) continue;
        g.beginPath();
        g.arc(xx * L * 0.1, -L * 0.98 + yy * L * 0.11, L * 0.025, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = '#ffffff';
    heartPath(g, 0, -L * 0.98, L * 0.18);
    g.fill();
    g.restore();
    if (t > 500 && t < 540) fx0.burst(hx + L * 0.35, hy, 14, ['#fff', '#ffe066', '#ff8fbf'], { speed: 6, size: 6 });
  });
}

/* ---- Pink: the alarm clock ------------------------------------------ */

function alarmClock({ label = '' } = {}) {
  let cap;
  const PINKS = ['#ff5c9a', '#ff8fbf', '#ffb3d1'];
  return scene('fx-pink', 3300, (t, { fx, g, W, H, fx0 }) => {
    cap ||= caption(fx, label || 'Drin drin!', 'pink');
    const R = Math.min(W * 0.26, H * 0.16);
    const cx = W / 2;
    const cy = H * 0.52;
    const ringing = t > 400 && t < 1900;
    const calm = t >= 1900;
    if (calm) cap.classList.add('show');
    if (calm && Math.floor(t / 180) !== Math.floor((t - 16) / 180)) fx0.rise(cx + (Math.random() - 0.5) * R * 2.4, cy - R * 0.4, PINKS, 'heart', 18);
    const s = easeOutBack(t / 450);
    g.save();
    g.translate(cx, cy);
    g.scale(s, s);
    g.rotate(ringing ? Math.sin(t / 35) * 0.12 : 0);
    // Feet, bells and hammer.
    g.fillStyle = '#d43d7c';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.roundRect(side * R * 0.62 - R * 0.1, R * 0.8, R * 0.2, R * 0.3, R * 0.08);
      g.fill();
    }
    for (const side of [-1, 1]) {
      g.save();
      g.rotate(side * 0.6);
      g.fillStyle = goldFill(g, 0, -R * 1.1, R * 0.32);
      g.beginPath();
      g.ellipse(0, -R * 1.02, R * 0.32, R * 0.3, 0, Math.PI, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.fillStyle = '#d43d7c';
    g.fillRect(-R * 0.04, -R * 1.18, R * 0.08, R * 0.2);
    // Body and face.
    const body = g.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R * 1.1);
    body.addColorStop(0, '#ffc2dc');
    body.addColorStop(1, '#ff5c9a');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fffafc';
    g.beginPath();
    g.arc(0, 0, R * 0.8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffb3d1';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.arc(Math.cos(a) * R * 0.68, Math.sin(a) * R * 0.68, R * 0.035, 0, Math.PI * 2);
      g.fill();
    }
    // Hands: spinning while ringing, then resting at ten past ten.
    const spin = ringing ? t / 60 : 0;
    g.strokeStyle = '#3a2330';
    g.lineCap = 'round';
    for (const [len, a, w] of [[0.38, calm ? -Math.PI * 0.83 : spin / 12, 0.07], [0.55, calm ? -Math.PI * 0.17 : spin, 0.045]]) {
      g.lineWidth = R * w;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * R * len, Math.sin(a) * R * len);
      g.stroke();
    }
    g.fillStyle = '#ff5c9a';
    g.beginPath();
    g.arc(0, 0, R * 0.06, 0, Math.PI * 2);
    g.fill();
    // Kawaii face: wide eyes while ringing, happy eyes and a smile after.
    for (const side of [-1, 1]) {
      const ex = side * R * 0.33;
      const ey = R * 0.28;
      g.fillStyle = '#3a2330';
      g.strokeStyle = '#3a2330';
      g.lineWidth = R * 0.05;
      if (calm) {
        g.beginPath();
        g.arc(ex, ey + R * 0.04, R * 0.09, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      } else {
        g.beginPath();
        g.arc(ex, ey, R * 0.08, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(ex - R * 0.025, ey - R * 0.03, R * 0.028, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(255,120,170,0.5)';
      g.beginPath();
      g.ellipse(side * R * 0.5, R * 0.44, R * 0.1, R * 0.06, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#3a2330';
    g.lineWidth = R * 0.045;
    g.beginPath();
    if (calm) g.arc(0, R * 0.42, R * 0.1, 0.2, Math.PI - 0.2);
    else g.ellipse(0, R * 0.5, R * 0.05, R * 0.07, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    // "Drin" lines beside the bells.
    if (ringing) {
      g.strokeStyle = '#ff5c9a';
      g.lineWidth = 4;
      g.lineCap = 'round';
      for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const a = -Math.PI / 2 + side * (0.75 + k * 0.22);
          const r0 = R * 1.3 + ((t / 8) % 12);
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          g.lineTo(cx + Math.cos(a) * (r0 + R * 0.2), cy + Math.sin(a) * (r0 + R * 0.2));
          g.stroke();
        }
      }
    }
    fx0.draw(g);
  });
}

/* ---- Pink: the little car ------------------------------------------- */

function pinkCar({ label = '' } = {}) {
  let cap;
  const PINKS = ['#ff5c9a', '#ff8fbf', '#c77dff'];
  return scene('fx-pink', 3000, (t, { fx, g, W, H, fx0 }) => {
    cap ||= caption(fx, label || 'Vroom!', 'pink');
    if (t > 900) cap.classList.add('show');
    const road = H * 0.66;
    g.fillStyle = 'rgba(200,170,255,0.45)';
    g.fillRect(0, road - 6, W, H * 0.12);
    g.fillStyle = '#ffffff';
    for (let x = -((t / 3) % 60); x < W; x += 60) g.fillRect(x, road + H * 0.05, 32, 5);
    const L = Math.min(W * 0.46, 240);
    const k = easeInOut(t / 2600);
    const x = -L + (W + 2 * L) * k;
    const y = road - L * 0.12 - Math.abs(Math.sin(t / 90)) * 3;
    const tilt = Math.sin(k * Math.PI) * -0.06;
    if (Math.floor(t / 70) !== Math.floor((t - 16) / 70)) {
      fx0.rise(x - L * 0.5, y + L * 0.02, PINKS, Math.random() < 0.5 ? 'heart' : 'spark', 12);
    }
    fx0.draw(g);
    // Speed lines.
    g.strokeStyle = 'rgba(255,92,154,0.35)';
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(x - L * (0.65 + i * 0.1), y - L * (0.25 - i * 0.08));
      g.lineTo(x - L * (1.05 + i * 0.1), y - L * (0.25 - i * 0.08));
      g.stroke();
    }
    g.save();
    g.translate(x, y);
    g.rotate(tilt);
    // Body and cabin.
    const body = g.createLinearGradient(0, -L * 0.45, 0, 0);
    body.addColorStop(0, '#ff8fbf');
    body.addColorStop(1, '#ff4f9a');
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(-L * 0.5, -L * 0.26, L, L * 0.24, L * 0.1);
    g.fill();
    g.beginPath();
    g.roundRect(-L * 0.28, -L * 0.46, L * 0.52, L * 0.26, [L * 0.14, L * 0.16, L * 0.02, L * 0.02]);
    g.fill();
    // Windshield with two big eyes.
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(-L * 0.04, -L * 0.42, L * 0.24, L * 0.18, [L * 0.02, L * 0.12, L * 0.02, L * 0.02]);
    g.fill();
    for (const ex of [L * 0.04, L * 0.13]) {
      g.fillStyle = '#3a2330';
      g.beginPath();
      g.ellipse(ex, -L * 0.33, L * 0.03, L * 0.045, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(ex - L * 0.01, -L * 0.35, L * 0.012, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.roundRect(-L * 0.24, -L * 0.42, L * 0.16, L * 0.16, [L * 0.12, L * 0.02, L * 0.02, L * 0.02]);
    g.fill();
    // Heart headlight, wheels.
    g.fillStyle = '#fff3b0';
    heartPath(g, L * 0.45, -L * 0.15, L * 0.1);
    g.fill();
    for (const wx of [-L * 0.3, L * 0.3]) {
      g.fillStyle = '#3a2330';
      g.beginPath();
      g.arc(wx, -L * 0.02, L * 0.11, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(wx, -L * 0.02);
      g.rotate(t / 40);
      g.fillStyle = '#ffb3d1';
      heartPath(g, 0, 0, L * 0.1);
      g.fill();
      g.restore();
    }
    g.restore();
  });
}

/* ---- The two of them: two paper planes drawing a heart --------------- */

function paperPlanes({ label = '' } = {}) {
  let cap;
  return scene('fx-dusk', 3600, (t, { fx, g, W, H, fx0 }) => {
    cap ||= caption(fx, label || 'Insieme', 'duo');
    const k = Math.min(W, H) / 40;
    const cx = W / 2;
    const cy = H * 0.46;
    const at = (u) => [cx + 16 * Math.sin(u) ** 3 * k, cy - (13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u)) * k];
    const p = easeInOut((t - 200) / 2000);
    // The finished heart glows.
    if (p >= 1) {
      const glow = clamp01((t - 2200) / 500);
      g.save();
      g.globalAlpha = glow * 0.9;
      const fill = g.createLinearGradient(cx - 16 * k, 0, cx + 16 * k, 0);
      fill.addColorStop(0, 'rgba(255,111,174,0.55)');
      fill.addColorStop(1, 'rgba(245,215,122,0.55)');
      g.fillStyle = fill;
      g.beginPath();
      for (let u = -Math.PI; u <= Math.PI; u += 0.05) g.lineTo(...at(u));
      g.fill();
      g.restore();
      cap.classList.add('show');
      if (t < 2240) fx0.burst(cx, cy + 17 * k, 24, ['#f5d77a', '#ff8fbf', '#ffffff'], { speed: 6, size: 8 });
    }
    for (const [dir, color] of [[1, '#d4a93c'], [-1, '#ff5c9a']]) {
      const end = dir * Math.PI * clamp01(p);
      g.strokeStyle = color;
      g.lineWidth = 4;
      g.setLineDash([2, 10]);
      g.lineCap = 'round';
      g.beginPath();
      for (let u = 0; Math.abs(u) <= Math.abs(end); u += dir * 0.03) g.lineTo(...at(u));
      g.stroke();
      g.setLineDash([]);
      if (p <= 0 || p >= 1) continue;
      const [x, y] = at(end);
      const [x2, y2] = at(end + dir * 0.02);
      g.save();
      g.translate(x, y);
      g.rotate(Math.atan2(y2 - y, x2 - x));
      const s = k * 1.6;
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(s, 0);
      g.lineTo(-s, -s * 0.7);
      g.lineTo(-s * 0.55, 0);
      g.lineTo(-s, s * 0.7);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.beginPath();
      g.moveTo(s, 0);
      g.lineTo(-s * 0.55, 0);
      g.lineTo(-s, s * 0.7);
      g.closePath();
      g.fill();
      g.restore();
    }
    fx0.draw(g);
  });
}

const PLAYERS = {
  drago: dragon,
  anelli: rings,
  ballo: dance,
  mare: beachWithWords,
  borsa: market,
  fulmine: storm,
  brindisi: cheers,
  viaggio: trip,
  macellaio: butcher,
  trattore: tractor,
  campanello: hotelBell,
  medaglie: medals,
  gattina: kittenDJ,
  racchetta: pinkRacket,
  sveglia: alarmClock,
  auto: pinkCar,
  aeroplanini: paperPlanes,
};

/**
 * Play a named celebration. `label` is the text some scenes show (a name on an apron,
 * a banner). Resolves when it is over (at once if motion is reduced).
 */
export async function playEffect(name, { label = '' } = {}) {
  const play = PLAYERS[name];
  if (!play || reduced()) return;
  try {
    await Promise.all([document.fonts?.load?.('12px "Press Start 2P"'), document.fonts?.load?.('48px Italianno')]);
  } catch {
    /* the arcade font is optional */
  }
  await play({ label });
}
