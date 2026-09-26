// Special celebrations for some quiz answers, mostly in big-pixel 90s style. Loaded only
// when needed; skipped when the phone asks for less motion.
import { audio } from './util.js';

export const EFFECTS = {
  drago: '🐉 Drago sputafuoco',
  anelli: "💍 Pioggia di anelli d'oro",
  ballo: "🕺 Ballerino anni '80",
  mare: '🏖️ Bamboletta al mare',
  borsa: '🔔 Campana della borsa',
  fulmine: '⚡ Fulmini ad alta tensione',
  brindisi: '🥂 Brindisi',
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
/* Cheers: a rosé and a red, clinking                                  */
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
const GLASS_PAL = { rim: '#9fb6d0', glass: '#eaf4ff', shine: '#ffffff', rose: '#ff8fb1', red: '#9b1b30' };

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
  const red = pixelGlass('red');
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
    for (const [side, img] of [[-1, rose], [1, red]]) {
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

const PLAYERS = {
  drago: dragon,
  anelli: rings,
  ballo: dance,
  mare: beachWithWords,
  borsa: market,
  fulmine: storm,
  brindisi: cheers,
};

/** Play a named celebration. Resolves when it is over (at once if motion is reduced). */
export async function playEffect(name) {
  const play = PLAYERS[name];
  if (!play || reduced()) return;
  try {
    await document.fonts?.load?.('12px "Press Start 2P"');
  } catch {
    /* the arcade font is optional */
  }
  await play();
}
