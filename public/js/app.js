import {
  $,
  $$,
  esc,
  richText,
  api,
  uploadForm,
  icon,
  fmtLongDate,
  fmtDateTime,
  relTime,
  initials,
  colorFor,
  countdown,
  resizeImage,
  toast,
  errorToast,
  sheet,
  confirmDialog,
  copyText,
  device,
  ACCENTS,
} from './util.js';

/* ================================================================== */
/* State & event bus                                                   */
/* ================================================================== */

export const S = {
  settings: {},
  me: null,
  isAdmin: false,
  revealed: false,
  vapidPublicKey: '',
  emailEnabled: false,
  online: 0,
};

const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

let cleanups = [];
export const onCleanup = (fn) => cleanups.push(fn);
/** Subscribe for the lifetime of the current view. */
export function on(name, fn) {
  const handler = (e) => fn(e.detail);
  bus.addEventListener(name, handler);
  onCleanup(() => bus.removeEventListener(name, handler));
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  emit('install-ready');
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  toast('App installata! La trovi tra le tue app 🎉');
});

export async function loadState() {
  const data = await api('/api/state');
  Object.assign(S, data);
  applyTheme();
  return data;
}

function applyTheme() {
  const accent = ACCENTS[S.settings.accent]?.color || ACCENTS.salvia.color;
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.classList.toggle('names-script', S.settings.nameFont === 'script');
  document.title = S.settings.coupleNames || 'Matrimonio';
  const link = $('#manifest-link');
  if (link && S.me?.loginKey) link.href = `/manifest.webmanifest?k=${encodeURIComponent(S.me.loginKey)}`;
}

export const boardOpen = () => S.isAdmin || S.settings.mode === 'live';
export const navigate = (hash) => {
  if (location.hash === `#${hash}`) route();
  else location.hash = hash;
};

/* ================================================================== */
/* Boot                                                                */
/* ================================================================== */

async function boot() {
  registerServiceWorker();
  try {
    await loadState();
  } catch {
    $('#app').innerHTML = `<div class="boot"><div class="boot-names">${esc(document.title)}</div>
      <p class="muted center">Connessione assente.<br>Controlla la rete e riprova.</p>
      <button class="btn primary" onclick="location.reload()">Riprova</button></div>`;
    return;
  }
  if (!S.me && !S.isAdmin) renderAuth();
  else startApp();
}

function startApp({ onboarding = false } = {}) {
  renderShell();
  connectStream();
  window.addEventListener('hashchange', route);
  route();
  syncPushSubscription();
  if (onboarding) setTimeout(showOnboarding, 350);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW', err));
  let reloaded = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // New version deployed: reload once, but never while the user is typing or uploading.
    if (!hadController || reloaded || document.querySelector('textarea:focus, .sheet-wrap')) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'navigate' && e.data.url) {
      const hash = new URL(e.data.url, location.origin).hash.slice(1);
      if (hash) navigate(hash);
    }
  });
}

/* ================================================================== */
/* Live stream (SSE)                                                   */
/* ================================================================== */

let es = null;
let disconnected = false;

function connectStream() {
  es?.close();
  es = new EventSource('/api/stream');
  const listen = (event, fn) =>
    es.addEventListener(event, (e) => {
      try {
        fn(JSON.parse(e.data));
      } catch (err) {
        console.error(err);
      }
    });
  listen('online', (n) => {
    S.online = n;
    updateOnline();
  });
  listen('msg', (m) => emit('msg', m));
  listen('like', (d) => emit('like', d));
  listen('del', (d) => emit('del', d));
  listen('settings', onSettings);
  listen('reveal', onReveal);
  listen('seating', () => refreshState().then(() => emit('seating')));
  listen('announce', showAnnouncement);
  listen('guests', () => emit('guests'));
  es.addEventListener('open', () => {
    if (disconnected) emit('reconnect');
    disconnected = false;
  });
  es.addEventListener('error', () => {
    disconnected = true;
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !es) return;
  if (es.readyState === EventSource.CLOSED) connectStream();
  const prevMode = S.settings.mode;
  refreshState().then(() => {
    if (S.settings.mode !== prevMode) onModeChanged();
    emit('reconnect');
  });
});

export async function refreshState() {
  try {
    await loadState();
  } catch {
    /* offline: keep current state */
  }
}

function onSettings(settings) {
  const prevMode = S.settings.mode;
  S.settings = settings;
  applyTheme();
  $('.brand-names') && ($('.brand-names').textContent = settings.coupleNames);
  if (settings.mode !== prevMode) return onModeChanged();
  if (['home', 'tavolo'].includes(currentView)) {
    refreshState().then(route);
  }
  emit('settings', settings);
}

function onModeChanged() {
  renderNav();
  if (S.settings.mode === 'live') {
    toast('📸 La bacheca live è aperta!');
    if (!S.isAdmin && ['home', 'profilo'].includes(currentView)) return navigate('bacheca');
  }
  if (!boardOpen() && ['bacheca', 'foto'].includes(currentView)) return navigate('home');
  route();
}

async function onReveal() {
  await refreshState();
  emit('seating');
  if (!S.me) return;
  const { el, close } = sheet(`
    <div class="celebrate">🎉</div>
    <h3 class="sheet-title center">I tavoli sono stati svelati!</h3>
    <p class="sheet-text center">${S.me.hasTable ? 'Scopri subito dove siederai e chi sarà con te.' : 'Stiamo ultimando gli ultimi dettagli: a breve vedrai il tuo tavolo.'}</p>
    <div class="sheet-actions"><button class="btn primary block" data-go>Scopri il tuo tavolo</button></div>`);
  el.querySelector('[data-go]').addEventListener('click', () => {
    close();
    navigate('tavolo');
  });
}

function showAnnouncement({ title, text }) {
  sheet(`
    <div class="announce-sheet-icon">${icon('megaphone')}</div>
    <h3 class="sheet-title center">${esc(title || S.settings.coupleNames)}</h3>
    <p class="sheet-text center">${richText(text)}</p>
    <div class="sheet-actions"><button class="btn primary block" data-close>Ok!</button></div>`);
}

/* ================================================================== */
/* Shell & router                                                      */
/* ================================================================== */

let currentView = '';

function renderShell() {
  document.body.classList.add('app-ready');
  $('#app').innerHTML = `
    <header class="topbar">
      <a class="brand" href="#home"><span class="brand-names">${esc(S.settings.coupleNames)}</span></a>
      <div class="top-actions">
        <span class="online-pill" id="online" hidden><i></i><b>0</b> online</span>
        <a class="avatar-btn" href="#profilo" aria-label="Profilo">${
          S.me ? esc(initials(S.me.name)) : icon('user')
        }</a>
      </div>
    </header>
    <main id="view" class="view"></main>
    <nav class="tabbar" id="tabbar"></nav>`;
  renderNav();
}

function navItems() {
  const items =
    S.settings.mode === 'live'
      ? [
          ['bacheca', 'Bacheca', 'chat'],
          ['foto', 'Foto', 'image'],
          ['tavolo', 'Tavolo', 'table'],
          ['home', 'Info', 'info'],
        ]
      : [
          ['home', 'Home', 'home'],
          ['tavolo', 'Tavolo', 'table'],
          ['profilo', 'Profilo', 'user'],
        ];
  if (S.isAdmin) items.push(['admin', 'Regia', 'sliders']);
  return items;
}

function renderNav() {
  const nav = $('#tabbar');
  if (!nav) return;
  nav.innerHTML = navItems()
    .map(
      ([id, label, ic]) =>
        `<a href="#${id}" data-tab="${id}" class="${currentView === id ? 'active' : ''}">${icon(ic)}<span>${label}</span></a>`,
    )
    .join('');
  updateOnline();
}

function updateOnline() {
  const el = $('#online');
  if (!el) return;
  el.hidden = S.settings.mode !== 'live' || S.online < 2;
  el.querySelector('b').textContent = S.online;
}

const defaultView = () => (S.settings.mode === 'live' ? 'bacheca' : 'home');

const VIEWS = {
  home: viewHome,
  tavolo: viewSeating,
  bacheca: viewBoard,
  foto: viewGallery,
  profilo: viewProfile,
  admin: (main, args) => import('./admin.js').then((m) => m.renderAdmin(main, args, adminCtx())),
  schermo: (main) => import('./admin.js').then((m) => m.renderScreen(main, adminCtx())),
};

// admin.js receives what it needs from here (importing app.js again would re-run it).
const adminCtx = () => ({ S, on, onCleanup, emit, navigate, route, refreshState, floorplanHTML, openLightbox, pickPhotos, renderShell });

function route() {
  cleanups.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  });
  cleanups = [];
  const [name, ...args] = (location.hash.slice(1) || defaultView()).split('/');
  let view = VIEWS[name] ? name : defaultView();
  if (['bacheca', 'foto'].includes(view) && !boardOpen()) view = 'home';
  if (['admin', 'schermo'].includes(view) && !S.isAdmin) view = 'home';
  currentView = view;
  document.body.dataset.view = view;
  $$('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === view));
  // A fresh element per view, so listeners bound by the previous view go away with it.
  const old = $('#view');
  const main = old.cloneNode(false);
  old.replaceWith(main);
  main.className = `view view-${view}`;
  window.scrollTo(0, 0);
  Promise.resolve(VIEWS[view](main, args)).catch((err) => {
    console.error(err);
    main.innerHTML = `<div class="container"><div class="card center"><p>${esc(err.message || 'Errore di caricamento')}</p>
      <button class="btn primary" id="retry">Riprova</button></div></div>`;
    $('#retry', main)?.addEventListener('click', route);
  });
}

/* ================================================================== */
/* Shared UI pieces                                                    */
/* ================================================================== */

function namesHTML(names) {
  return esc(names).replace(/\s(&amp;|e|\+)\s/, ' <span class="amp">$1</span> ');
}

function heroHTML({ compact = false } = {}) {
  const s = S.settings;
  const cover = s.coverImage ? `/uploads/${s.coverImage}` : '';
  return `
    <section class="hero ${cover ? `has-cover tone-${s.coverTone === 'light' ? 'light' : 'dark'}` : ''} ${compact ? 'compact' : ''}" ${cover ? `style="--cover:url('${cover}')"` : ''}>
      <div class="hero-inner">
        <div class="hero-kicker">Il matrimonio di</div>
        <h1 class="hero-names">${namesHTML(s.coupleNames)}</h1>
        ${s.weddingDate ? `<div class="hero-date">${esc(fmtLongDate(s.weddingDate, s.tz))}</div>` : ''}
        ${s.weddingDate && !compact ? `<div class="countdown" data-countdown="${esc(s.weddingDate)}" data-kind="wedding"></div>` : ''}
      </div>
    </section>`;
}

function countdownBoxes(c) {
  const box = (n, l) => `<div class="cd-box"><b>${String(n).padStart(2, '0')}</b><span>${l}</span></div>`;
  return box(c.d, c.d === 1 ? 'giorno' : 'giorni') + box(c.h, 'ore') + box(c.m, 'min') + box(c.s, 'sec');
}

/** Live countdowns for every [data-countdown] element in root. */
function mountCountdowns(root) {
  const els = $$('[data-countdown]', root);
  if (!els.length) return;
  const tick = () => {
    for (const el of els) {
      const c = countdown(el.dataset.countdown);
      if (!c.done) {
        el.innerHTML = countdownBoxes(c);
        continue;
      }
      if (el.dataset.kind === 'wedding') {
        const sameDay = Date.now() - Date.parse(el.dataset.countdown) < 20 * 3600 * 1000;
        el.innerHTML = `<div class="cd-done">${sameDay ? 'Oggi è il grande giorno! 💍' : 'Grazie di cuore per aver festeggiato con noi ♥'}</div>`;
      } else if (el.dataset.kind === 'reveal' && !el.dataset.fired) {
        el.dataset.fired = '1';
        el.innerHTML = `<div class="cd-done">Ci siamo quasi…</div>`;
        setTimeout(() => refreshState().then(() => emit('seating')), 4000);
      }
    }
  };
  tick();
  const timer = setInterval(tick, 1000);
  onCleanup(() => clearInterval(timer));
}

/* ================================================================== */
/* Push notifications & install                                        */
/* ================================================================== */

function urlB64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function swRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.ready;
}

export async function pushState() {
  if (device.inApp) return 'in-app';
  if (device.ios && !device.standalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await swRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'enabled' : 'off';
}

async function enablePush() {
  if (!S.me) throw new Error('Registrati per attivare le notifiche');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permesso non concesso: puoi riattivarlo dalle impostazioni');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(S.vapidPublicKey),
    });
  }
  await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
}

/** Keep the server in sync with this device's subscription (e.g. after a new login). */
async function syncPushSubscription() {
  try {
    if (!S.me || (await pushState()) !== 'enabled') return;
    const reg = await swRegistration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  } catch (err) {
    console.warn('push sync', err);
  }
}

const IOS_SHARE = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;

function openInBrowserHTML() {
  const url = location.origin;
  const intent = `intent://${location.host}/#Intent;scheme=https;package=com.android.chrome;end`;
  return `
    <div class="note warn">Stai usando il browser interno di un'altra app (WhatsApp, Instagram…): da qui non si può installare l'app.</div>
    ${
      device.android
        ? `<a class="btn primary block" href="${intent}">Apri in Chrome</a>`
        : `<ol class="steps"><li>Tocca i <b>tre puntini</b> o il tasto <b>Condividi</b> ${IOS_SHARE}</li><li>Scegli <b>«Apri in Safari»</b></li></ol>`
    }
    <button class="btn ghost block" data-copy="${esc(url)}">${icon('copy')} Copia il link</button>`;
}

function installGuideHTML() {
  if (device.standalone()) {
    return `<div class="note ok">${icon('check')} Stai usando l'app installata. Perfetto!</div>`;
  }
  if (device.inApp) return openInBrowserHTML();
  if (device.ios) {
    return `
      <p>Aggiungi l'app alla schermata Home: bastano 10 secondi.</p>
      <ol class="steps">
        <li>Tocca il tasto <b>Condividi</b> ${IOS_SHARE} ${device.iosChrome ? '(in alto a destra)' : '(in basso al centro)'}</li>
        <li>Scorri e scegli <b>«Aggiungi alla schermata Home»</b> ${icon('plusSquare')}</li>
        <li>Tocca <b>«Aggiungi»</b> in alto a destra</li>
        <li>Apri l'app dalla nuova icona sulla Home 🎉</li>
      </ol>`;
  }
  if (installPrompt) {
    return `<p>Installa l'app sul telefono con un tocco:</p>
      <button class="btn primary block" data-install>${icon('download')} Installa l'app</button>`;
  }
  if (device.android) {
    return `<ol class="steps">
        <li>Tocca il menu ${icon('dots')} in alto a destra</li>
        <li>Scegli <b>«Installa app»</b> oppure <b>«Aggiungi a schermata Home»</b></li>
        <li>Conferma: l'icona apparirà tra le tue app 🎉</li>
      </ol>`;
  }
  return `<p class="muted">Sei su computer: puoi usare l'app direttamente da qui. Per averla sul telefono apri questo stesso link dal cellulare.</p>`;
}

async function pushBoxHTML() {
  const state = await pushState();
  const emailNote = S.emailEnabled && S.me?.email ? `<p class="small muted">In ogni caso riceverai le comunicazioni importanti anche via email (${esc(S.me.email)}).</p>` : '';
  switch (state) {
    case 'enabled':
      return `<div class="note ok">${icon('check')} Notifiche attive su questo dispositivo</div>
        <button class="btn ghost small" data-push-test>Invia una notifica di prova</button>`;
    case 'off':
      return `<p>Attiva le notifiche per sapere il tuo tavolo nel momento esatto in cui verrà svelato e per non perdere gli annunci.</p>
        <button class="btn primary block" data-push-on>${icon('bell')} Attiva le notifiche</button>${emailNote}`;
    case 'needs-install':
      return `<p>Su iPhone le notifiche funzionano solo dopo aver <b>aggiunto l'app alla schermata Home</b>.</p>
        ${installGuideHTML()}
        <p class="small muted">Poi apri l'app dall'icona e torna qui per attivarle.</p>${emailNote}`;
    case 'denied':
      return `<div class="note warn">Hai bloccato le notifiche per questo sito.</div>
        <p class="small">Per riattivarle apri le impostazioni del browser (icona del lucchetto accanto all'indirizzo › Notifiche › Consenti).</p>${emailNote}`;
    case 'in-app':
      return openInBrowserHTML() + emailNote;
    default:
      return `<p class="muted">Questo browser non supporta le notifiche.</p>${emailNote}`;
  }
}

/** Wire the buttons produced by pushBoxHTML/installGuideHTML inside root. */
function bindDeviceActions(root, rerender) {
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-push-on],[data-push-test],[data-install],[data-copy]');
    if (!t) return;
    t.disabled = true;
    try {
      if (t.matches('[data-push-on]')) {
        await enablePush();
        toast('Notifiche attivate! 🔔');
        await refreshState();
      } else if (t.matches('[data-push-test]')) {
        const r = await api('/api/push/test', { method: 'POST' });
        toast(r.delivered ? 'Notifica inviata: controlla il telefono!' : 'Nessun dispositivo raggiunto');
      } else if (t.matches('[data-install]') && installPrompt) {
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
      } else if (t.matches('[data-copy]')) {
        await copyText(t.dataset.copy);
      }
    } catch (err) {
      errorToast(err);
    } finally {
      t.disabled = false;
      rerender?.();
    }
  });
}

async function showOnboarding() {
  const state = await pushState();
  if (state === 'enabled') return;
  const { el } = sheet(`
    <div class="celebrate">🎉</div>
    <h3 class="sheet-title center">Benvenuto${S.me ? `, ${esc(S.me.name.split(' ')[0])}` : ''}!</h3>
    <p class="sheet-text center">Ultimo passo, consigliatissimo:</p>
    <div class="onboard-box"></div>
    <div class="sheet-actions"><button class="btn ghost block" data-close>Più tardi</button></div>`);
  const box = el.querySelector('.onboard-box');
  const render = async () => {
    box.innerHTML = await pushBoxHTML();
    if ((await pushState()) === 'enabled') {
      el.querySelector('[data-close]').textContent = 'Fatto!';
      el.querySelector('[data-close]').className = 'btn primary block';
    }
  };
  bindDeviceActions(box, render);
  // The sheet outlives view changes, so it manages its own listener.
  const onInstall = () => (document.body.contains(el) ? render() : bus.removeEventListener('install-ready', onInstall));
  bus.addEventListener('install-ready', onInstall);
  await render();
}

/* ================================================================== */
/* Auth: registration, login, admin login                              */
/* ================================================================== */

function renderAuth() {
  document.body.dataset.view = 'auth';
  $('#app').innerHTML = `
    <div class="auth">
      ${heroHTML()}
      <div class="container narrow">
        ${device.inApp ? `<section class="card">${openInBrowserHTML()}</section>` : ''}
        <section class="card auth-card">
          <h2 class="card-title">Entra nell'app</h2>
          <p class="muted">Registrati per avere tutte le informazioni, scoprire il tuo tavolo e condividere le foto del grande giorno.</p>
          <form id="reg-form" class="form" novalidate>
            <label class="field"><span>Nome e cognome</span>
              <input name="name" autocomplete="name" autocapitalize="words" required placeholder="Es. Mario Rossi" /></label>
            <label class="field"><span>Email</span>
              <input name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" required placeholder="Es. mario@email.it" /></label>
            <button class="btn primary block big" type="submit">Entra</button>
          </form>
          <p class="small muted center">Useremo la tua email solo per le comunicazioni del matrimonio.</p>
        </section>
        <p class="center"><button class="link" id="to-login">Ti sei già registrato? <b>Accedi</b></button></p>
        <p class="center"><button class="link subtle" id="admin-login">${icon('lock')} Area riservata agli sposi</button></p>
      </div>
    </div>`;
  mountCountdowns($('#app'));
  bindDeviceActions($('#app'));

  $('#reg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    const name = f.name.value.trim();
    const email = f.email.value.trim();
    if (!/\s/.test(name)) return toast('Scrivi nome e cognome', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Controlla l’indirizzo email', 'error');
    btn.disabled = true;
    try {
      const r = await api('/api/register', { method: 'POST', body: { name, email } });
      if (r.needCode) return codeSheet(email, 'Ti sei già registrato con questa email: per sicurezza ti abbiamo inviato un codice.');
      await afterLogin({ onboarding: true });
    } catch (err) {
      if (!err.data?.emailTaken) return errorToast(err);
      const login = await confirmDialog(err.message, { title: 'Email già registrata', ok: 'Accedi', cancel: 'Cambia email' });
      if (login) loginSheet(email);
      else f.email.select();
    } finally {
      btn.disabled = false;
    }
  });
  $('#to-login').addEventListener('click', () => loginSheet());
  $('#admin-login').addEventListener('click', adminLoginSheet);
}

async function afterLogin(opts) {
  await loadState();
  if (!S.me && !S.isAdmin) return renderAuth();
  startApp(opts);
}

function loginSheet(prefill = '') {
  const { el, close } = sheet(`
    <h3 class="sheet-title">Accedi</h3>
    <p class="sheet-text">Scrivi l'email con cui ti sei registrato.</p>
    <form class="form" id="login-form">
      <label class="field"><span>Email</span><input name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" required value="${esc(prefill)}" /></label>
      <button class="btn primary block">Continua</button>
    </form>`);
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    try {
      const r = await api('/api/login/request', { method: 'POST', body: { email } });
      close();
      if (r.ok) return afterLogin();
      if (r.choose) return chooseSheet(email, r.choose, null);
      if (r.needCode) codeSheet(email);
    } catch (err) {
      errorToast(err);
    }
  });
  setTimeout(() => el.querySelector('input').focus(), 300);
}

function codeSheet(email, intro = '') {
  const { el, close } = sheet(`
    <h3 class="sheet-title">Controlla la tua email</h3>
    <p class="sheet-text">${esc(intro)} Abbiamo inviato un codice di 6 cifre a <b>${esc(email)}</b>.<br>
      <span class="small muted">Non lo trovi? Guarda anche nello spam.</span></p>
    <form class="form" id="code-form">
      <input class="code-input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="••••••" required />
      <button class="btn primary block">Accedi</button>
    </form>`);
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = e.target.code.value.trim();
    try {
      const r = await api('/api/login/verify', { method: 'POST', body: { email, code } });
      close();
      if (r.choose) return chooseSheet(email, r.choose, code);
      await afterLogin();
    } catch (err) {
      errorToast(err);
    }
  });
  setTimeout(() => el.querySelector('input').focus(), 300);
}

function chooseSheet(email, people, code) {
  const { el, close } = sheet(`
    <h3 class="sheet-title">Chi sei?</h3>
    <div class="choose-list">${people
      .map((p) => `<button class="btn ghost block" data-id="${p.id}">${esc(p.name)}</button>`)
      .join('')}</div>`);
  el.addEventListener('click', async (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (!id) return;
    try {
      if (code) await api('/api/login/verify', { method: 'POST', body: { email, code, guestId: Number(id) } });
      else await api('/api/login/pick', { method: 'POST', body: { email, guestId: Number(id) } });
      close();
      await afterLogin();
    } catch (err) {
      errorToast(err);
    }
  });
}

export function adminLoginSheet() {
  const { el, close } = sheet(`
    <h3 class="sheet-title">${icon('lock')} Area riservata</h3>
    <p class="sheet-text">Inserisci la password degli sposi per gestire l'app.</p>
    <form class="form" id="admin-form">
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required /></label>
      <button class="btn primary block">Entra</button>
    </form>`);
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: e.target.password.value } });
      close();
      toast('Benvenuti, sposi! 💍');
      await loadState();
      if (!$('#tabbar')) startApp();
      else renderShell();
      navigate('admin');
    } catch (err) {
      errorToast(err);
    }
  });
  setTimeout(() => el.querySelector('input').focus(), 300);
}

/* ================================================================== */
/* View: Home / Info                                                   */
/* ================================================================== */

function sectionHTML(sec) {
  if (!sec.title && !sec.body) return '';
  const img = sec.image ? `/uploads/${sec.image}` : '';
  return `
    <section class="card info-card ${img ? 'has-img' : ''}">
      ${img ? `<img class="info-img" src="${esc(img)}" alt="" loading="lazy" />` : ''}
      ${sec.icon ? `<div class="info-icon">${esc(sec.icon)}</div>` : ''}
      <div class="info-body">
        ${sec.title ? `<h3>${esc(sec.title)}</h3>` : ''}
        ${sec.subtitle ? `<div class="info-sub">${esc(sec.subtitle)}</div>` : ''}
        ${sec.body ? `<p>${richText(sec.body)}</p>` : ''}
        ${sec.linkUrl ? `<a class="btn outline small" href="${esc(sec.linkUrl)}" target="_blank" rel="noopener">${esc(sec.linkLabel || 'Apri')} ${icon('external')}</a>` : ''}
      </div>
    </section>`;
}

function seatingTeaserHTML() {
  const s = S.settings;
  if (S.revealed && S.me?.hasTable) {
    return `<a class="card teaser" href="#tavolo"><div class="teaser-ic">${icon('table')}</div>
      <div><b>Il tuo tavolo è pronto!</b><div class="muted small">Tocca per scoprire dove siederai</div></div>${icon('right')}</a>`;
  }
  if (s.revealAt && !S.revealed) {
    return `<a class="card teaser reveal" href="#tavolo">
      <div class="teaser-top"><div class="teaser-ic">${icon('gift')}</div><div><b>Il tuo tavolo sarà svelato tra</b></div></div>
      <div class="countdown small" data-countdown="${esc(s.revealAt)}" data-kind="reveal"></div></a>`;
  }
  return '';
}

async function viewHome(main) {
  const s = S.settings;
  const ann = s.lastAnnouncement && Date.now() - s.lastAnnouncement.at < 3 * 86400000 ? s.lastAnnouncement : null;
  main.innerHTML = `
    ${heroHTML()}
    <div class="container">
      ${s.mode === 'live' ? `<a class="card live-cta" href="#bacheca"><span class="live-dot"></span><div><b>La bacheca live è aperta!</b><div class="small">Condividi foto e messaggi con tutti</div></div>${icon('right')}</a>` : ''}
      ${ann ? `<section class="card announce-card">${icon('megaphone')}<div>${ann.title ? `<b>${esc(ann.title)}</b>` : ''}<p>${richText(ann.text)}</p></div></section>` : ''}
      ${seatingTeaserHTML()}
      ${s.welcomeTitle || s.welcomeText ? `<section class="card welcome"><h2 class="script">${esc(s.welcomeTitle)}</h2><p>${richText(s.welcomeText)}</p></section>` : ''}
      ${(s.sections || []).map(sectionHTML).join('')}
      <div id="home-push"></div>
      <p class="foot">Con amore, ${esc(s.coupleNames)} ♥</p>
    </div>`;
  mountCountdowns(main);
  if (S.me) {
    const state = await pushState();
    if (state !== 'enabled' && state !== 'unsupported') {
      const box = $('#home-push', main);
      box.className = 'card';
      box.innerHTML = `<h3 class="card-title small-title">${icon('bell')} Non perderti nulla</h3>${await pushBoxHTML()}`;
      bindDeviceActions(box, () => route());
    }
  }
}

/* ================================================================== */
/* View: Seating                                                       */
/* ================================================================== */

function autoPosition(i, n) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.4)));
  const rows = Math.max(1, Math.ceil(n / cols));
  return { x: ((i % cols) + 0.5) * (100 / cols), y: (Math.floor(i / cols) + 0.5) * (100 / rows) };
}

export function floorplanHTML({ floorplan, tables = [] }, highlightId, { editable = false } = {}) {
  if (!floorplan && !tables.length) return '';
  const list = tables
    .map((t, i) => (t.x != null && t.y != null ? t : floorplan ? null : { ...t, ...autoPosition(i, tables.length) }))
    .filter(Boolean);
  return `
    <div class="floorplan ${floorplan ? 'has-img' : 'blank'} ${editable ? 'editable' : ''}">
      ${floorplan ? `<img src="${esc(floorplan)}" alt="Piantina della sala" draggable="false" />` : ''}
      ${list
        .map(
          (t) =>
            `<div class="fp-table ${t.id === highlightId ? 'me' : ''}" data-table="${t.id}" style="left:${t.x}%;top:${t.y}%"><i></i><span>${esc(t.name)}</span></div>`,
        )
        .join('')}
    </div>`;
}

async function viewSeating(main) {
  main.innerHTML = `<div class="container"><div class="card skeleton" style="height:220px"></div></div>`;
  const render = async () => {
    const d = await api('/api/seating');
    const s = S.settings;
    let body;
    if (!d.revealed) {
      body = `
        <section class="card mystery">
          <div class="mystery-emoji">🎁</div>
          <h2 class="script">Il tuo tavolo</h2>
          ${
            d.revealAt
              ? `<p>La disposizione dei tavoli sarà svelata<br><b>${esc(fmtDateTime(d.revealAt, s.tz))}</b></p>
                 <div class="countdown" data-countdown="${esc(d.revealAt)}" data-kind="reveal"></div>`
              : '<p>La disposizione dei tavoli sarà svelata presto. Stay tuned!</p>'
          }
          <p class="small muted">Riceverai una notifica${S.me?.email ? ` e un'email a ${esc(S.me.email)}` : ''} nel momento esatto in cui verrà svelata.</p>
        </section>
        ${S.me ? `<section class="card" id="seat-push"></section>` : ''}
        ${S.isAdmin && d.tables?.length ? `<section class="card"><h3 class="card-title small-title">Anteprima sposi: la sala</h3>${floorplanHTML(d)}</section>` : ''}`;
    } else if (!d.table) {
      body = `
        <section class="card mystery">
          <div class="mystery-emoji">🪑</div>
          <h2 class="script">Quasi pronto…</h2>
          <p>${S.me ? 'Stiamo ultimando la disposizione: riceverai una notifica appena il tuo posto sarà pronto.' : 'Accedi come invitato per vedere il tuo tavolo.'}</p>
        </section>
        ${d.tables?.length ? `<section class="card"><h3 class="card-title small-title">La sala</h3>${floorplanHTML(d)}</section>` : ''}`;
    } else {
      body = `
        <section class="card table-card">
          <div class="table-kicker">Il tuo tavolo</div>
          <h2 class="table-name">${esc(d.table.name)}</h2>
          ${d.table.description ? `<p class="table-desc">${richText(d.table.description)}</p>` : ''}
          ${d.seat ? `<div class="seat-pill">Posto <b>${esc(d.seat)}</b></div>` : ''}
        </section>
        ${
          d.tables?.length || d.floorplan
            ? `<section class="card"><h3 class="card-title small-title">${icon('pin')} Dove si trova</h3>${floorplanHTML(d, d.table.id)}</section>`
            : ''
        }
        ${
          d.mates?.length
            ? `<section class="card"><h3 class="card-title small-title">${icon('users')} Con te al tavolo</h3>
                <ul class="mates">${d.mates.map((n) => `<li><span class="avatar sm" style="background:${colorFor(n)}">${esc(initials(n))}</span>${esc(n)}</li>`).join('')}</ul></section>`
            : ''
        }`;
    }
    main.innerHTML = `<div class="container">${body}</div>`;
    mountCountdowns(main);
    const pushBox = $('#seat-push', main);
    if (pushBox) {
      const state = await pushState();
      if (state === 'enabled') pushBox.remove();
      else {
        pushBox.innerHTML = `<h3 class="card-title small-title">${icon('bell')} Attiva le notifiche</h3>${await pushBoxHTML()}`;
        bindDeviceActions(pushBox, render);
      }
    }
  };
  on('seating', render);
  await render();
}

/* ================================================================== */
/* View: Board (chat + photos)                                         */
/* ================================================================== */

const isMine = (m) => (m.isAdmin ? S.isAdmin : !!S.me && m.guestId === S.me.id);

function likeHTML(m) {
  return `<button class="like ${m.liked ? 'on' : ''}" data-like="${m.id}" aria-label="Mi piace">${icon('heart')}<span>${m.likes || ''}</span></button>`;
}

function msgHTML(m) {
  const mine = isMine(m);
  const del = mine || S.isAdmin ? `<button class="msg-del" data-del="${m.id}" aria-label="Elimina">${icon('trash')}</button>` : '';
  const time = `<time>${esc(relTime(m.createdAt, S.settings.tz))}</time>`;
  if (m.kind === 'announce') {
    const [title, ...rest] = m.text.split('\n');
    return `<article class="msg announce" data-id="${m.id}">
      <div class="announce-head">${icon('megaphone')} ${esc(m.author)}</div>
      <div class="announce-title">${esc(title)}</div>
      ${rest.length ? `<p>${richText(rest.join('\n'))}</p>` : ''}
      <div class="msg-meta">${time}${likeHTML(m)}${del}</div>
    </article>`;
  }
  const avatar = m.isAdmin ? '💍' : esc(initials(m.author));
  return `<article class="msg ${mine ? 'mine' : ''} ${m.kind === 'photo' ? 'has-photo' : ''}" data-id="${m.id}">
    ${mine ? '' : `<div class="avatar" style="background:${m.isAdmin ? 'var(--accent)' : colorFor(m.author)}">${avatar}</div>`}
    <div class="msg-body">
      ${mine ? '' : `<div class="msg-author">${esc(m.author)}${m.isAdmin ? ' <span class="badge">Sposi</span>' : ''}</div>`}
      ${
        m.kind === 'photo'
          ? `<button class="msg-photo" data-photo="${m.id}" aria-label="Apri foto"><img src="${esc(m.thumb)}" ${m.w && m.h ? `width="${m.w}" height="${m.h}"` : ''} loading="lazy" alt="Foto di ${esc(m.author)}" /></button>`
          : ''
      }
      ${m.text ? `<div class="bubble">${richText(m.text)}</div>` : ''}
      <div class="msg-meta">${time}${likeHTML(m)}${del}</div>
    </div>
  </article>`;
}

async function toggleLike(id) {
  const r = await api(`/api/messages/${id}/like`, { method: 'POST' });
  emit('like', r);
  return r;
}

function updateLikeButtons(root, { id, likes, liked }) {
  for (const btn of $$(`[data-like="${id}"]`, root)) {
    btn.querySelector('span').textContent = likes || '';
    if (liked !== undefined) btn.classList.toggle('on', liked);
  }
}

async function deleteMessage(id) {
  if (!(await confirmDialog('Vuoi eliminare questo contenuto?', { ok: 'Elimina', danger: true }))) return false;
  await api(`/api/messages/${id}`, { method: 'DELETE' });
  emit('del', { id });
  return true;
}

function heartBurst(target) {
  const h = document.createElement('div');
  h.className = 'heart-burst';
  h.innerHTML = icon('heart');
  target.appendChild(h);
  setTimeout(() => h.remove(), 900);
}

async function uploadPhoto(file, caption, onProgress) {
  let full;
  let thumb;
  try {
    [full, thumb] = await resizeImage(file, [
      { max: 2560, quality: 0.86 },
      { max: 960, quality: 0.8 },
    ]);
  } catch (err) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw err;
    full = { blob: file, w: 0, h: 0 };
  }
  const form = new FormData();
  form.append('photo', full.blob, 'photo.jpg');
  if (thumb) form.append('thumb', thumb.blob, 'thumb.jpg');
  form.append('w', full.w);
  form.append('h', full.h);
  form.append('caption', caption || '');
  return uploadForm('/api/photos', form, onProgress);
}

export function pickPhotos(onDone) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.addEventListener('change', () => {
    const files = [...input.files].slice(0, 20);
    if (files.length) photoSheet(files, onDone);
  });
  input.click();
}

function photoSheet(files, onDone) {
  const urls = files.map((f) => URL.createObjectURL(f));
  const { el, close } = sheet(
    `<h3 class="sheet-title">${files.length === 1 ? 'Condividi la foto' : `Condividi ${files.length} foto`}</h3>
     <div class="preview-strip">${urls.map((u) => `<img src="${u}" alt="" />`).join('')}</div>
     <form class="form" id="photo-form">
       <label class="field"><span>Didascalia (facoltativa)</span><input name="caption" maxlength="500" placeholder="Es. Che emozione! 😍" /></label>
       <div class="progress" hidden><div class="progress-bar"></div><span class="progress-label"></span></div>
       <button class="btn primary block big">${icon('upload')} Pubblica</button>
     </form>`,
    { onClose: () => urls.forEach((u) => URL.revokeObjectURL(u)) },
  );
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const caption = e.target.caption.value.trim();
    const bar = el.querySelector('.progress');
    const fill = el.querySelector('.progress-bar');
    const label = el.querySelector('.progress-label');
    btn.disabled = true;
    bar.hidden = false;
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      label.textContent = files.length > 1 ? `Foto ${i + 1} di ${files.length}…` : 'Caricamento…';
      try {
        const r = await uploadPhoto(files[i], i === 0 ? caption : '', (p) => {
          fill.style.width = `${((i + p) / files.length) * 100}%`;
        });
        ok++;
        emit('msg', r.message);
      } catch (err) {
        errorToast(err);
      }
    }
    fill.style.width = '100%';
    close();
    if (ok) toast(ok === 1 ? 'Foto pubblicata! 📸' : `${ok} foto pubblicate! 📸`);
    onDone?.();
  });
}

async function viewBoard(main) {
  const s = S.settings;
  const canChat = S.isAdmin || s.allowChat;
  const canPhoto = S.isAdmin || s.allowPhotos;
  main.innerHTML = `
    ${s.mode !== 'live' ? `<div class="banner">${icon('eye')} Anteprima: gli invitati vedranno la bacheca quando attiverai la modalità Live.</div>` : ''}
    <div class="feed-wrap">
      <div class="feed-more" hidden><button class="btn small ghost" id="more">Messaggi precedenti</button></div>
      <div class="feed" id="feed"></div>
      <div class="empty" id="empty" hidden>
        <div class="empty-emoji">📸</div>
        <h3>La bacheca è pronta!</h3>
        <p>Scatta la prima foto o scrivi un messaggio per gli sposi.</p>
      </div>
    </div>
    <button class="new-pill" id="newpill" hidden>Nuovi messaggi ${icon('down')}</button>
    <form class="composer" id="composer">
      ${canPhoto ? `<button type="button" class="composer-cam" id="pick" aria-label="Aggiungi foto">${icon('camera')}</button>` : ''}
      <textarea id="txt" rows="1" maxlength="1000" placeholder="${canChat ? 'Scrivi un messaggio…' : 'La chat è in pausa'}" ${canChat ? '' : 'disabled'}></textarea>
      <button class="composer-send" id="send" aria-label="Invia" ${canChat ? '' : 'disabled'}>${icon('send')}</button>
    </form>`;
  document.body.classList.add('has-composer');
  onCleanup(() => document.body.classList.remove('has-composer', 'typing'));

  const feed = $('#feed', main);
  const ids = new Set();
  let messages = [];
  let firstId = null;

  const nearBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 180;
  const toBottom = (smooth) =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  const updateEmpty = () => ($('#empty', main).hidden = messages.length > 0);

  function append(list, { prepend = false } = {}) {
    const fresh = list.filter((m) => !ids.has(m.id));
    if (!fresh.length) return 0;
    fresh.forEach((m) => ids.add(m.id));
    const htmlStr = fresh.map(msgHTML).join('');
    if (prepend) {
      messages = [...fresh, ...messages];
      feed.insertAdjacentHTML('afterbegin', htmlStr);
    } else {
      messages = [...messages, ...fresh];
      feed.insertAdjacentHTML('beforeend', htmlStr);
    }
    firstId = messages[0]?.id ?? null;
    updateEmpty();
    return fresh.length;
  }

  async function loadOlder() {
    const btn = $('#more', main);
    btn.disabled = true;
    const before = document.documentElement.scrollHeight;
    const r = await api(`/api/messages?before=${firstId}&limit=40`);
    append(r.messages, { prepend: true });
    window.scrollTo(0, window.scrollY + document.documentElement.scrollHeight - before);
    $('.feed-more', main).hidden = !r.hasMore;
    btn.disabled = false;
  }

  const r = await api('/api/messages?limit=40');
  append(r.messages);
  $('.feed-more', main).hidden = !r.hasMore;
  requestAnimationFrame(() => toBottom(false));
  $('#more', main).addEventListener('click', () => loadOlder().catch(errorToast));

  const pill = $('#newpill', main);
  pill.addEventListener('click', () => {
    pill.hidden = true;
    toBottom(true);
  });
  const onScroll = () => nearBottom() && (pill.hidden = true);
  window.addEventListener('scroll', onScroll, { passive: true });
  onCleanup(() => window.removeEventListener('scroll', onScroll));

  on('msg', (m) => {
    const stick = nearBottom() || isMine(m);
    if (!append([m])) return;
    if (stick) requestAnimationFrame(() => toBottom(true));
    else pill.hidden = false;
  });
  on('like', (d) => {
    const m = messages.find((x) => x.id === d.id);
    if (m) {
      m.likes = d.likes;
      if (d.liked !== undefined) m.liked = d.liked;
    }
    updateLikeButtons(feed, d);
  });
  on('del', ({ id }) => {
    messages = messages.filter((m) => m.id !== id);
    ids.delete(id);
    feed.querySelector(`[data-id="${id}"]`)?.remove();
    updateEmpty();
  });
  on('reconnect', async () => {
    const last = messages[messages.length - 1]?.id || 0;
    const rr = await api(`/api/messages?after=${last}&limit=100`).catch(() => null);
    if (rr?.messages.length) {
      const stick = nearBottom();
      append(rr.messages);
      if (stick) toBottom(true);
    }
  });

  feed.addEventListener('click', async (e) => {
    const like = e.target.closest('[data-like]');
    const del = e.target.closest('[data-del]');
    const photo = e.target.closest('[data-photo]');
    try {
      if (like) await toggleLike(Number(like.dataset.like));
      else if (del) await deleteMessage(Number(del.dataset.del));
      else if (photo) {
        const photos = messages.filter((m) => m.kind === 'photo');
        openLightbox(photos, photos.findIndex((m) => m.id === Number(photo.dataset.photo)));
      }
    } catch (err) {
      errorToast(err);
    }
  });
  feed.addEventListener('dblclick', async (e) => {
    const photo = e.target.closest('[data-photo]');
    if (!photo) return;
    const m = messages.find((x) => x.id === Number(photo.dataset.photo));
    heartBurst(photo);
    if (m && !m.liked) toggleLike(m.id).catch(errorToast);
  });

  // Composer
  const txt = $('#txt', main);
  const form = $('#composer', main);
  const grow = () => {
    txt.style.height = 'auto';
    txt.style.height = `${Math.min(txt.scrollHeight, 130)}px`;
  };
  txt.addEventListener('input', grow);
  txt.addEventListener('focus', () => document.body.classList.add('typing'));
  txt.addEventListener('blur', () => setTimeout(() => document.body.classList.remove('typing'), 150));
  // On computers Enter sends; on phones Enter adds a new line and the button sends.
  const desktop = window.matchMedia('(pointer: fine)').matches;
  txt.addEventListener('keydown', (e) => {
    if (desktop && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = txt.value.trim();
    if (!text) return;
    const btn = $('#send', main);
    btn.disabled = true;
    try {
      const res = await api('/api/messages', { method: 'POST', body: { text } });
      txt.value = '';
      grow();
      emit('msg', res.message);
    } catch (err) {
      errorToast(err);
    } finally {
      btn.disabled = false;
    }
  });
  $('#pick', main)?.addEventListener('click', () => pickPhotos());

  // Keep the composer above the on-screen keyboard (iOS).
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const onResize = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', `${kb}px`);
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    onCleanup(() => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
      document.documentElement.style.setProperty('--kb', '0px');
    });
  }
}

/* ================================================================== */
/* View: Gallery                                                       */
/* ================================================================== */

async function viewGallery(main) {
  const canPhoto = S.isAdmin || S.settings.allowPhotos;
  main.innerHTML = `
    <div class="container gallery-head">
      <div><h2 class="script">Le foto</h2><div class="muted small" id="gcount"></div></div>
      ${canPhoto ? `<button class="btn primary small" id="gadd">${icon('camera')} Aggiungi</button>` : ''}
    </div>
    <div class="grid" id="grid"></div>
    <div id="sentinel"></div>
    <div class="empty" id="gempty" hidden><div class="empty-emoji">🖼️</div><h3>Ancora nessuna foto</h3><p>Sii il primo a condividere un momento speciale!</p></div>`;
  const grid = $('#grid', main);
  let photos = []; // newest first
  let hasMore = true;
  let loading = false;

  const tile = (m) =>
    `<button class="tile" data-id="${m.id}"><img src="${esc(m.thumb)}" loading="lazy" alt="Foto di ${esc(m.author)}" />${
      m.likes ? `<span class="tile-likes">${icon('heart')}${m.likes}</span>` : ''
    }</button>`;
  const refreshMeta = () => {
    $('#gempty', main).hidden = photos.length > 0;
    $('#gcount', main).textContent = photos.length ? `${photos.length}${hasMore ? '+' : ''} foto condivise` : '';
  };

  async function loadMore() {
    if (loading || !hasMore) return;
    loading = true;
    const before = photos.length ? `&before=${photos[photos.length - 1].id}` : '';
    const r = await api(`/api/messages?kind=photo&limit=60${before}`);
    const list = r.messages.reverse();
    photos.push(...list);
    grid.insertAdjacentHTML('beforeend', list.map(tile).join(''));
    hasMore = r.hasMore;
    loading = false;
    refreshMeta();
  }
  await loadMore();

  const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore().catch(errorToast), {
    rootMargin: '600px',
  });
  io.observe($('#sentinel', main));
  onCleanup(() => io.disconnect());

  grid.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (t) openLightbox(photos, photos.findIndex((m) => m.id === Number(t.dataset.id)));
  });
  $('#gadd', main)?.addEventListener('click', () => pickPhotos());

  on('msg', (m) => {
    if (m.kind !== 'photo' || photos.some((p) => p.id === m.id)) return;
    photos.unshift(m);
    grid.insertAdjacentHTML('afterbegin', tile(m));
    refreshMeta();
  });
  on('del', ({ id }) => {
    photos = photos.filter((p) => p.id !== id);
    grid.querySelector(`[data-id="${id}"]`)?.remove();
    refreshMeta();
  });
  on('like', (d) => {
    const m = photos.find((p) => p.id === d.id);
    if (!m) return;
    m.likes = d.likes;
    if (d.liked !== undefined) m.liked = d.liked;
    const t = grid.querySelector(`[data-id="${d.id}"]`);
    if (t) t.outerHTML = tile(m);
  });
}

/* ================================================================== */
/* Lightbox                                                            */
/* ================================================================== */

async function savePhoto(m) {
  try {
    const blob = await (await fetch(m.photo)).blob();
    const file = new File([blob], `foto-${m.id}.jpg`, { type: blob.type || 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = m.photo;
  a.download = `foto-${m.id}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function openLightbox(list, index) {
  if (index < 0 || !list.length) return;
  let i = index;
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `
    <div class="lb-top"><div class="lb-author"></div><button class="icon-btn" data-x aria-label="Chiudi">${icon('x')}</button></div>
    <div class="lb-stage"><img alt="" /></div>
    <button class="lb-nav lb-prev" aria-label="Precedente">${icon('left')}</button>
    <button class="lb-nav lb-next" aria-label="Successiva">${icon('right')}</button>
    <div class="lb-bottom"><div class="lb-caption"></div><div class="lb-actions"></div></div>`;
  document.body.appendChild(lb);
  document.body.classList.add('no-scroll');
  const img = lb.querySelector('.lb-stage img');

  const show = () => {
    const m = list[i];
    img.src = m.thumb;
    const full = new Image();
    full.onload = () => list[i] === m && (img.src = m.photo);
    full.src = m.photo;
    lb.querySelector('.lb-author').innerHTML = `<b>${esc(m.author)}</b> · ${esc(relTime(m.createdAt, S.settings.tz))}`;
    lb.querySelector('.lb-caption').innerHTML = m.text ? richText(m.text) : '';
    lb.querySelector('.lb-actions').innerHTML = `
      ${likeHTML(m)}
      <button class="btn small ghost-light" data-save>${icon('download')} Salva</button>
      ${isMine(m) || S.isAdmin ? `<button class="btn small ghost-light" data-del="${m.id}">${icon('trash')}</button>` : ''}`;
    lb.querySelector('.lb-prev').hidden = i === 0;
    lb.querySelector('.lb-next').hidden = i === list.length - 1;
    [list[i - 1], list[i + 1]].forEach((n) => n && (new Image().src = n.photo));
  };
  const go = (d) => {
    const n = i + d;
    if (n >= 0 && n < list.length) {
      i = n;
      show();
    }
  };
  const close = () => {
    lb.remove();
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
    bus.removeEventListener('like', onLike);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  };
  const onLike = (e) => {
    const m = list.find((x) => x.id === e.detail.id);
    if (!m) return;
    m.likes = e.detail.likes;
    if (e.detail.liked !== undefined) m.liked = e.detail.liked;
    if (list[i] === m) updateLikeButtons(lb, { ...e.detail, liked: m.liked });
  };
  document.addEventListener('keydown', onKey);
  bus.addEventListener('like', onLike);

  lb.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]')) return close();
    if (e.target.closest('.lb-prev')) return go(-1);
    if (e.target.closest('.lb-next')) return go(1);
    const m = list[i];
    try {
      if (e.target.closest('[data-like]')) await toggleLike(m.id);
      else if (e.target.closest('[data-save]')) await savePhoto(m);
      else if (e.target.closest('[data-del]')) {
        if (await deleteMessage(m.id)) {
          list.splice(i, 1);
          if (!list.length) return close();
          i = Math.min(i, list.length - 1);
          show();
        }
      }
    } catch (err) {
      errorToast(err);
    }
  });
  lb.addEventListener('dblclick', (e) => {
    if (!e.target.closest('.lb-stage')) return;
    heartBurst(lb.querySelector('.lb-stage'));
    if (!list[i].liked) toggleLike(list[i].id).catch(errorToast);
  });

  let x0 = null;
  let y0 = null;
  const stage = lb.querySelector('.lb-stage');
  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return (x0 = null);
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  });
  stage.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (dy > 120 && Math.abs(dy) > Math.abs(dx)) close();
    x0 = null;
  });
  show();
}

/* ================================================================== */
/* View: Profile                                                       */
/* ================================================================== */

async function viewProfile(main) {
  main.innerHTML = `
    <div class="container">
      ${
        S.me
          ? `<section class="card profile-card">
              <div class="avatar big" style="background:${colorFor(S.me.name)}">${esc(initials(S.me.name))}</div>
              <h2>${esc(S.me.name)}</h2>
              <p class="muted">${esc(S.me.email || '')}</p>
              <button class="link" id="rename">${icon('edit')} Modifica nome</button>
            </section>
            <section class="card"><h3 class="card-title small-title">${icon('bell')} Notifiche</h3><div id="push-box"></div></section>`
          : `<section class="card"><p>Sei connesso come <b>sposi</b> (amministratori).</p></section>`
      }
      <section class="card"><h3 class="card-title small-title">${icon('phone')} L'app sul telefono</h3><div id="install-box"></div></section>
      <section class="card stack">
        ${S.isAdmin ? `<a class="btn ghost block" href="#admin">${icon('sliders')} Vai alla regia</a>` : `<button class="btn ghost block" id="admin-login">${icon('lock')} Area riservata agli sposi</button>`}
        <button class="btn ghost block" id="logout">${icon('logout')} Esci</button>
      </section>
    </div>`;
  const renderBoxes = async () => {
    const pb = $('#push-box', main);
    if (pb) pb.innerHTML = await pushBoxHTML();
    $('#install-box', main).innerHTML = installGuideHTML();
  };
  bindDeviceActions(main, renderBoxes);
  on('install-ready', renderBoxes);
  await renderBoxes();

  $('#rename', main)?.addEventListener('click', () => {
    const { el, close } = sheet(`
      <h3 class="sheet-title">Il tuo nome</h3>
      <form class="form"><label class="field"><span>Nome e cognome</span><input name="name" value="${esc(S.me.name)}" required /></label>
      <button class="btn primary block">Salva</button></form>`);
    el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api('/api/me', { method: 'PATCH', body: { name: e.target.name.value } });
        S.me = r.me;
        close();
        renderShell();
        route();
      } catch (err) {
        errorToast(err);
      }
    });
  });
  $('#admin-login', main)?.addEventListener('click', adminLoginSheet);
  $('#logout', main).addEventListener('click', async () => {
    if (!(await confirmDialog('Vuoi uscire da questo dispositivo?', { ok: 'Esci' }))) return;
    try {
      const reg = await swRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
    } catch {
      /* ignore */
    }
    await api('/api/logout', { method: 'POST' });
    location.hash = '';
    location.reload();
  });
}

boot();
