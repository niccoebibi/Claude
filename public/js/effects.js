// Special celebrations for some quiz answers: a fire-breathing dragon, a shower of gold
// rings, an 8-bit dancer. Loaded only when needed; skipped when the phone asks for less motion.

export const EFFECTS = {
  drago: '🐉 Drago sputafuoco',
  anelli: "💍 Pioggia di anelli d'oro",
  ballo: "🕺 Ballerino anni '80",
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

const PLAYERS = { drago: dragon, anelli: rings, ballo: dance };

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
