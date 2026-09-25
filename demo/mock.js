/*
 * Demo backend: simulates the server inside the browser so the real app UI can be
 * previewed without deploying (fetch, EventSource and upload XHR are intercepted).
 * Sample data only; everything stays in this browser (localStorage).
 */
(function () {
  'use strict';

  const KEY = 'wedding-demo-v7';
  const DEMO_URL = 'https://www.17aprile2027.it';
  const ACCENTS = {
    salvia: { name: 'Salvia', color: '#6F826A' },
    oro: { name: 'Oro', color: '#A8844E' },
    cipria: { name: 'Cipria', color: '#BF7B7B' },
    terracotta: { name: 'Terracotta', color: '#B5653E' },
    lavanda: { name: 'Lavanda', color: '#7E72A6' },
    blu: { name: 'Blu notte', color: '#2F4A6D' },
    bordeaux: { name: 'Bordeaux', color: '#7D2E3E' },
    cobalto: { name: 'Blu cobalto', color: '#3D518A' },
  };
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nameKey = (n) =>
    String(n || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' ');
  // Europe/Rome is UTC+2 in April.
  const rome = (y, mo, d, h, mi) => new Date(Date.UTC(y, mo - 1, d, h - 2, mi)).toISOString();

  /* ---------------------------------------------------------------- */
  /* Sample photos, painted on a canvas                                */
  /* ---------------------------------------------------------------- */

  function paintPhoto(emoji, from, to, seed) {
    const w = 900;
    const h = 1125;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, from);
    grad.addColorStop(1, to);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    let r = seed;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      g.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.18})`;
      g.arc(rnd() * w, rnd() * h, 20 + rnd() * 110, 0, Math.PI * 2);
      g.fill();
    }
    g.font = '330px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, w / 2, h / 2);
    return c.toDataURL('image/jpeg', 0.78);
  }

  /* ---------------------------------------------------------------- */
  /* Seed data                                                         */
  /* ---------------------------------------------------------------- */

  function arrangeTables(list) {
    const isCouple = (t) => t.shape === 'rect' || /spos/i.test(t.name);
    const couple = list.filter(isCouple);
    const others = list.filter((t) => !isCouple(t));
    const r1 = (v) => Math.round(v * 10) / 10;
    couple.forEach((t, i) => Object.assign(t, { x: r1(50 + (i - (couple.length - 1) / 2) * 22), y: 13 }));
    const cols = others.length <= 4 ? Math.max(1, others.length) : Math.ceil(Math.sqrt(others.length * 2));
    const rows = Math.max(1, Math.ceil(others.length / cols));
    others.forEach((t, i) => {
      const r0 = Math.floor(i / cols);
      const inRow = Math.min(cols, others.length - r0 * cols);
      const x = 12 + (((i % cols) + 0.5) * 76) / cols + ((cols - inRow) * 76) / cols / 2;
      const y = rows === 1 ? 55 : 35 + (r0 * 48) / (rows - 1);
      Object.assign(t, { x: r1(x), y: r1(y) });
    });
    return list;
  }

  function seed() {
    const t = Date.now();
    // 19 tables like the real hall: the couple's table for two at the top centre, 18 round tables in rows.
    const tables = [{ id: 1, name: 'Sposi', description: 'Il tavolo degli sposi', shape: 'rect', seats: 2, sort: 1 }];
    for (let n = 1; n <= 18; n++) {
      tables.push({ id: n + 1, name: `Tavolo ${n}`, description: '', shape: 'round', seats: 8, sort: n + 1 });
    }
    arrangeTables(tables);
    const first = ['Anna', 'Luca', 'Sara', 'Marco', 'Chiara', 'Paolo', 'Elena', 'Davide', 'Giulia', 'Matteo', 'Laura', 'Andrea', 'Francesca', 'Stefano', 'Valentina', 'Alessandro', 'Martina', 'Simone', 'Federica', 'Riccardo', 'Silvia', 'Tommaso', 'Irene', 'Giorgio', 'Camilla', 'Lorenzo', 'Alice', 'Filippo', 'Marta', 'Edoardo'];
    const last = ['Rossi', 'Bianchi', 'Conti', 'Ferri', 'Galli', 'Moretti', 'Russo', 'Esposito', 'Rinaldi', 'Colombo', 'Marino', 'Greco', 'Bruno', 'Costa', 'Fontana', 'Lombardi', 'Barbieri', 'Neri', 'Ricci', 'Gallo', 'Leone', 'Longo', 'Mancini', 'Serra', 'Villa', 'Caruso', 'Ferrara', 'De Luca'];
    const people = [['Niccolò', 1], ['Beatrice', 1]];
    const used = new Set();
    let k = 0;
    for (let tIdx = 2; tIdx <= 19; tIdx++) {
      // Table 7 keeps a free seat for whoever registers in the preview.
      const size = tIdx === 8 ? 7 : 8;
      for (let j = 0; j < size; j++) {
        let name;
        do {
          name = `${first[(k * 7 + 3) % first.length]} ${last[(k * 11 + 5) % last.length]}`;
          k++;
        } while (used.has(name));
        used.add(name);
        people.push([name, tIdx]);
      }
    }
    const guests = people.map(([name, tableId], i) => ({
      id: i + 1,
      name,
      email: i % 5 === 4 ? null : `${name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '.')}@email.it`,
      tableId,
      seat: '',
      registered: i % 4 !== 3,
      registeredAt: t - (160 - i) * 3600000,
      pushDevices: i % 3 === 0 ? 0 : 1,
      notifiedAt: null,
      emailStatus: null,
    }));
    const photos = [
      paintPhoto('💐', '#e9c9c0', '#9fb09a', 3),
      paintPhoto('🥂', '#f3e2c4', '#c9a36b', 7),
      paintPhoto('💍', '#dfe6ef', '#8ea2bd', 11),
      paintPhoto('🎂', '#f6d9dd', '#d79aa4', 17),
      paintPhoto('💃', '#e6dcf0', '#9d8cbf', 23),
      paintPhoto('🌅', '#fbd9b0', '#e08f6a', 29),
    ];
    const msg = (id, guestId, author, kind, text, photo, minsAgo, likes, isAdmin = false) => ({
      id,
      guestId,
      author,
      isAdmin,
      kind,
      text,
      photo: photo ?? null,
      thumb: photo ?? null,
      w: photo ? 900 : null,
      h: photo ? 1125 : null,
      likes,
      likedBy: [],
      createdAt: t - minsAgo * 60000,
      deleted: false,
    });
    const messages = [
      msg(1, 8, 'Luca Bianchi', 'photo', 'La chiesa è meravigliosa 💐', photos[0], 190, 12),
      msg(2, 12, 'Carla Conti', 'text', 'Che emozione! Siete bellissimi ❤️', null, 175, 8),
      msg(3, 7, 'Sara Galli', 'photo', 'Primo brindisi! 🥂', photos[1], 150, 15),
      msg(4, null, 'Niccolò & Beatrice', 'announce', "Benvenuti!\nL'aperitivo è servito in giardino 🍸", null, 140, 21, true),
      msg(5, 20, 'Martina Colombo', 'photo', '', photos[2], 120, 9),
      msg(6, 16, 'Teresa Ferri', 'text', 'Auguri ragazzi, una giornata perfetta 🌸', null, 95, 6),
    ];
    return {
      v: 7,
      meId: null,
      admin: false,
      pushEnabled: false,
      startHash: '',
      nextId: { guest: 1000, table: 100, msg: 100 },
      scriptStep: 0,
      spare: photos.slice(3),
      tables,
      guests,
      messages,
      settings: {
        coupleNames: 'Niccolò & Beatrice',
        // Time as printed on the paper invitation.
        weddingDate: rome(2027, 4, 17, 17, 0),
        tz: 'Europe/Rome',
        accent: 'cobalto',
        nameFont: 'script',
        welcomeTitle: 'Il nostro giorno',
        welcomeText:
          "Una data da ricordare. Una giornata da vivere insieme. Un sì per tutta la vita.\n\nDopo otto anni, la promessa di sceglierci per sempre.\n\nNon vediamo l'ora di celebrare con voi uno dei momenti più importanti della nostra vita.",
        // Absolute URL: a relative url() inside a CSS variable resolves against the stylesheet.
        coverImage: new URL('img/copertina.jpg', document.baseURI).href,
        coverTone: 'light',
        sections: [
          { icon: '', title: 'Il momento del sì', subtitle: 'Sabato 17 aprile 2027 · ore 17:00', body: 'Basilica dei Santi Giovanni e Paolo al Celio\nPiazza dei Santi Giovanni e Paolo 13, Roma\n\n🅿️ Parcheggio riservato presso la Basilica', linkLabel: 'Apri in Maps', linkUrl: 'https://maps.google.com/?q=Basilica+dei+Santi+Giovanni+e+Paolo+al+Celio,+Piazza+dei+Santi+Giovanni+e+Paolo+13,+Roma', image: '' },
          { icon: '', title: 'Dopo il sì', subtitle: 'Palazzo Brancaccio', body: 'Viale del Monte Oppio 7, Roma\n\n🅿️ Parcheggio riservato nel cortile del Palazzo', linkLabel: 'Apri in Maps', linkUrl: 'https://maps.google.com/?q=Palazzo+Brancaccio,+Viale+del+Monte+Oppio+7,+Roma', image: 'img/palazzo-brancaccio.jpg' },
          { icon: 'line:busta', title: 'Conferma la tua presenza', subtitle: 'Entro il 31 gennaio', body: 'Saremmo felici di ricevere la vostra conferma.', linkLabel: 'Conferma (RSVP)', linkUrl: 'https://withjoy.com/niccolo-beatrice-2027/rsvp', image: '' },
          { icon: 'line:regalo', title: 'Un pensiero per noi', subtitle: 'Lista nozze', body: 'La vostra presenza è il regalo più bello.\nPer chi desidera farci un pensiero: la nostra casa e il nostro viaggio di nozze.', linkLabel: 'Scopri la lista nozze', linkUrl: 'https://withjoy.com/niccolo-beatrice-2027/page/un-pensiero-per-noi', image: 'img/lista-nozze.jpg' },
        ],
        mode: 'info',
        autoLiveAt: null,
        notifyOnLive: true,
        allowPhotos: true,
        allowChat: true,
        revealAt: rome(2027, 4, 17, 18, 45),
        revealAnnounced: false,
        revealMessage: '',
        lastAnnouncement: null,
        floorplan: null,
        hallEntrance: { x: 10, y: 97 },
        iconVersion: 0,
        customIcon: false,
        adminEmail: 'sposi@gmail.com',
        email: { provider: 'gmail', host: '', port: 465, secure: true, user: 'sposi@gmail.com', pass: 'x', fromEmail: '', fromName: '' },
      },
    };
  }

  let store;
  try {
    store = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    store = null;
  }
  if (!store || store.v !== 7) store = seed();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* storage full or blocked: the demo keeps working in memory */
    }
  };
  save();
  if (store.startHash) {
    history.replaceState(null, '', `#${store.startHash}`);
    store.startHash = '';
    save();
  }

  const S = () => store.settings;
  const me = () => store.guests.find((g) => g.id === store.meId) || null;
  const isRevealed = () => !!S().revealAt && Date.now() >= Date.parse(S().revealAt);
  const liker = () => (store.meId ? `g${store.meId}` : 'admin');
  const table = (id) => store.tables.find((t) => t.id === id);

  function publicSettings() {
    const { email, adminEmail, revealAnnounced, ...rest } = S(); // eslint-disable-line no-unused-vars
    return structuredClone(rest);
  }
  function adminSettings() {
    const s = structuredClone(S());
    s.email = { ...s.email, pass: '', hasPass: !!S().email.pass };
    return s;
  }
  function meJson(g) {
    return { id: g.id, name: g.name, email: g.email, loginKey: 'demo', hasTable: !!g.tableId, pushDevices: store.pushEnabled ? 1 : 0 };
  }
  function msgJson(m) {
    const { likedBy, deleted, ...rest } = m; // eslint-disable-line no-unused-vars
    return { ...rest, liked: likedBy.includes(liker()) };
  }

  /* ---------------------------------------------------------------- */
  /* Live stream                                                       */
  /* ---------------------------------------------------------------- */

  const clients = new Set();
  class DemoEventSource {
    constructor() {
      this.readyState = 1;
      this.listeners = {};
      clients.add(this);
      setTimeout(() => {
        this._emit('open');
        this._emit('online', onlineCount());
      }, 20);
    }
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    }
    removeEventListener() {}
    close() {
      this.readyState = 2;
      clients.delete(this);
    }
    _emit(type, data) {
      for (const fn of this.listeners[type] || []) fn({ data: data === undefined ? '' : JSON.stringify(data) });
    }
  }
  DemoEventSource.CONNECTING = 0;
  DemoEventSource.OPEN = 1;
  DemoEventSource.CLOSED = 2;
  window.EventSource = DemoEventSource;

  const broadcast = (type, data) => setTimeout(() => clients.forEach((c) => c._emit(type, data)), 40);
  const onlineCount = () => (S().mode === 'live' ? 28 + Math.floor(Math.random() * 14) : 1 + Math.floor(Math.random() * 3));

  /* ---------------------------------------------------------------- */
  /* Demo UI helpers: toast, fake push banner, email preview           */
  /* ---------------------------------------------------------------- */

  function toast(text) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 3600);
  }

  let autoIcon = null;
  function makeAutoIcon() {
    const s = S();
    const c = document.createElement('canvas');
    c.width = c.height = 192;
    const g = c.getContext('2d');
    g.fillStyle = (ACCENTS[s.accent] || ACCENTS.salvia).color;
    g.fillRect(0, 0, 192, 192);
    g.strokeStyle = 'rgba(251,248,243,.55)';
    g.lineWidth = 2.3;
    g.beginPath();
    g.arc(96, 96, 69, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#FBF8F3';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const script = s.nameFont === 'script';
    g.font = script ? '400 77px "Italianno", serif' : '600 58px "Cormorant Garamond", serif';
    const parts = s.coupleNames.split(/\s*(?:&|\+|\se\s)\s*/i).filter(Boolean);
    g.fillText(parts.length > 1 ? `${parts[0][0]}&${parts[1][0]}` : s.coupleNames.slice(0, 2), 96, script ? 102 : 99);
    autoIcon = c.toDataURL('image/png');
  }
  Promise.all([document.fonts?.load('400 77px "Italianno"'), document.fonts?.load('600 58px "Cormorant Garamond"')])
    .catch(() => {})
    .then(makeAutoIcon);

  function fakePush(title, body, hash) {
    const el = document.createElement('div');
    el.className = 'demo-push';
    el.innerHTML = `<div class="dp-caption">Anteprima della notifica sul telefono</div>
      <div class="dp-card"><img src="${store.iconUrl || autoIcon || 'icon/icon-192.png'}" alt="" />
      <div><div class="dp-top"><b>${esc(S().coupleNames)}</b><span>ora</span></div>
      <div class="dp-title">${esc(title)}</div><div class="dp-body">${esc(body)}</div></div></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    const hide = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    };
    el.addEventListener('click', () => {
      if (hash) location.hash = hash;
      hide();
    });
    setTimeout(hide, 6500);
  }

  function emailPreview() {
    const s = S();
    const accent = (ACCENTS[s.accent] || ACCENTS.salvia).color;
    const g = me() || store.guests.find((x) => x.tableId === 2);
    const t = table(g.tableId) || table(2);
    const mates = store.guests.filter((x) => x.tableId === t.id && x.id !== g.id).map((x) => x.name);
    const date = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: s.tz }).format(new Date(s.weddingDate));
    const intro = s.revealMessage?.trim() || 'è arrivato il momento che aspettavi: ecco dove siederai!';
    const html = `
      <div style="background:#F4EFE7;padding:18px 10px;border-radius:16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2E2A26">
       <div style="max-width:520px;margin:0 auto;background:#FFFDF9;border-radius:20px;border:1px solid #E8E0D4;overflow:hidden">
        <div style="text-align:center;padding:28px 24px 8px">
          <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${accent}">Il matrimonio di</div>
          <div style="font-family:Georgia,serif;font-size:30px;margin-top:6px">${esc(s.coupleNames)}</div>
          <div style="font-size:14px;color:#8A8077;margin-top:6px">${esc(date)}</div>
          <div style="width:48px;height:2px;background:${accent};margin:18px auto 0"></div>
        </div>
        <div style="padding:14px 24px;font-size:16px;line-height:1.6">
          <p style="margin:0 0 14px">Ciao ${esc(g.name.split(' ')[0])},<br>${esc(intro)}</p>
          <div style="text-align:center;background:#F7F2EA;border-radius:16px;padding:22px 14px;margin-bottom:18px">
            <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8A8077">Il tuo tavolo</div>
            <div style="font-family:Georgia,serif;font-size:32px;color:${accent};margin-top:6px">${esc(t.name)}</div>
            ${t.description ? `<div style="font-size:15px;color:#6B625A;margin-top:6px">${esc(t.description)}</div>` : ''}
          </div>
          ${mates.length ? `<p style="margin:0 0 4px;font-weight:600">Con te al tavolo:</p><p style="margin:0;color:#4A433D">${mates.map(esc).join(' · ')}</p>` : ''}
        </div>
        <div style="text-align:center;padding:10px 24px 28px"><span style="display:inline-block;background:${accent};color:#fff;font-weight:600;padding:13px 26px;border-radius:999px">Vedi la piantina</span></div>
       </div></div>`;
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet-backdrop" data-x></div><div class="sheet" role="dialog" aria-modal="true">
      <button class="sheet-x icon-btn" data-x aria-label="Chiudi">✕</button>
      <h3 class="sheet-title">L'email degli invitati</h3>
      <p class="sheet-text small">Oggetto: 🪑 Il tuo tavolo al matrimonio di ${esc(s.coupleNames)}</p>${html}</div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    wrap.addEventListener('click', (e) => {
      if (!e.target.closest('[data-x]')) return;
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 250);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Admin helpers                                                     */
  /* ---------------------------------------------------------------- */

  function stats() {
    const gs = store.guests;
    const live = store.messages.filter((m) => !m.deleted);
    return {
      guests: gs.length,
      registered: gs.filter((g) => g.registered).length,
      withPush: gs.filter((g) => g.pushDevices).length,
      pushDevices: gs.filter((g) => g.pushDevices).length,
      tables: store.tables.length,
      withTable: gs.filter((g) => g.tableId).length,
      registeredNoTable: gs.filter((g) => g.registered && !g.tableId).length,
      toNotify: gs.filter((g) => (g.registered || g.email) && g.tableId).length,
      notified: gs.filter((g) => g.notifiedAt).length,
      emailSent: gs.filter((g) => g.emailStatus === 'sent').length,
      emailErrors: 0,
      emailPending: 0,
      messages: live.filter((m) => m.kind !== 'photo').length,
      photos: live.filter((m) => m.kind === 'photo').length,
      online: onlineCount(),
    };
  }
  function guestRows() {
    return [...store.guests]
      .sort((a, b) => a.name.localeCompare(b.name, 'it'))
      .map((g) => ({ ...g, tableName: table(g.tableId)?.name || null }));
  }
  function tableRows() {
    return [...store.tables]
      .sort((a, b) => a.sort - b.sort)
      .map((t) => ({
        ...t,
        guests: store.guests.filter((g) => g.tableId === t.id).map((g) => ({ id: g.id, name: g.name })),
      }));
  }
  const resetNotice = (g) => {
    g.notifiedAt = null;
    g.emailStatus = null;
  };
  function findOrCreateTable(name) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const found = store.tables.find((t) => t.name.toLowerCase() === clean.toLowerCase());
    if (found) return { id: found.id, created: false };
    const id = store.nextId.table++;
    store.tables.push({ id, name: clean, description: '', x: null, y: null, sort: store.tables.length + 1 });
    return { id, created: true };
  }
  function insertMessage(fields) {
    const m = {
      id: store.nextId.msg++,
      guestId: null,
      author: '',
      isAdmin: false,
      kind: 'text',
      text: '',
      photo: null,
      thumb: null,
      w: null,
      h: null,
      likes: 0,
      likedBy: [],
      createdAt: Date.now(),
      deleted: false,
      ...fields,
    };
    store.messages.push(m);
    save();
    if (S().mode === 'live' || store.admin) broadcast('msg', msgJson(m));
    return msgJson(m);
  }
  function author() {
    if (store.admin) return { guestId: store.meId, author: S().coupleNames, isAdmin: true };
    const g = me();
    return { guestId: g.id, author: g.name, isAdmin: false };
  }

  function setMode(mode, notify) {
    const prev = S().mode;
    S().mode = mode;
    save();
    broadcast('settings', publicSettings());
    if (mode === 'live' && prev !== 'live') {
      if (notify) fakePush('📸 La chat LIVE è aperta!', 'Condividi foto e messaggi in diretta con tutti gli invitati.', 'bacheca');
      scheduleActivity();
    }
  }

  function doReveal() {
    if (!isRevealed() || S().revealAnnounced) return;
    S().revealAnnounced = true;
    const t0 = Date.now();
    for (const g of store.guests) {
      if ((g.registered || g.email) && g.tableId && !g.notifiedAt) {
        g.notifiedAt = t0;
        g.emailStatus = g.email ? 'sent' : 'no-email';
      }
    }
    save();
    broadcast('reveal', {});
    const g = me();
    const t = g && table(g.tableId);
    fakePush('🪑 Il tuo tavolo è pronto!', t ? `Sarai al tavolo «${t.name}». Tocca per vedere la disposizione.` : 'Tocca per scoprire dove siederai.', 'tavolo');
  }

  setInterval(() => {
    const s = S();
    if (s.autoLiveAt && Date.now() >= Date.parse(s.autoLiveAt)) {
      s.autoLiveAt = null;
      if (s.mode !== 'live') setMode('live', s.notifyOnLive);
    }
    doReveal();
  }, 1000);

  /* Scripted activity so the live board feels alive in the preview. */
  const SCRIPT = [
    { by: 'Chiara Moretti', text: 'Il vestito della sposa è un sogno 😍' },
    { by: 'Andrea Greco', photo: 0, text: 'Il taglio della torta! 🎂' },
    { by: 'Rosa Esposito', text: 'Evviva gli sposi!!! 🎉🎉' },
    { by: 'Simone Colombo', text: 'Qualcuno ha visto il mio cravattino? 😂' },
    { by: 'Beatrice Lombardi', photo: 1, text: 'Tutti in pista 💃' },
    { by: 'Franco Conti', text: 'Grazie per questa giornata bellissima ❤️' },
    { by: 'Giorgia Marino', photo: 2, text: 'Tramonto dalla terrazza 🌅' },
  ];
  let activityTimer = null;
  function scheduleActivity() {
    clearTimeout(activityTimer);
    if (S().mode !== 'live' || store.scriptStep >= SCRIPT.length) return;
    activityTimer = setTimeout(() => {
      if (S().mode === 'live' && document.visibilityState === 'visible') {
        const step = SCRIPT[store.scriptStep++];
        const g = store.guests.find((x) => x.name === step.by);
        const photo = step.photo !== undefined ? store.spare[step.photo] : null;
        insertMessage({ guestId: g?.id ?? null, author: step.by, kind: photo ? 'photo' : 'text', text: step.text, photo, thumb: photo, w: photo ? 900 : null, h: photo ? 1125 : null });
        const target = store.messages.filter((m) => !m.deleted)[Math.floor(Math.random() * store.messages.length)];
        if (target) {
          target.likes++;
          save();
          broadcast('like', { id: target.id, likes: target.likes });
        }
      }
      scheduleActivity();
    }, 14000 + Math.random() * 8000);
  }
  scheduleActivity();
  setInterval(() => broadcast('online', onlineCount()), 15000);

  /* ---------------------------------------------------------------- */
  /* Routes                                                            */
  /* ---------------------------------------------------------------- */

  const fail = (status, error) => ({ status, body: { error } });
  const needUser = () => (!store.meId && !store.admin ? fail(401, 'Registrati per continuare') : null);
  const boardOpen = () => store.admin || S().mode === 'live';

  const ROUTES = [
    ['GET', /^\/api\/state$/, () => ({
      settings: publicSettings(),
      revealed: isRevealed(),
      me: me() ? meJson(me()) : null,
      isAdmin: store.admin,
      vapidPublicKey: 'demo',
      emailEnabled: true,
      serverTime: Date.now(),
    })],

    ['POST', /^\/api\/register$/, (b) => {
      const name = String(b.name || '').trim().replace(/\s+/g, ' ');
      const email = String(b.email || '').trim().toLowerCase();
      if (name.length < 2 || !/\s/.test(name)) return fail(400, 'Scrivi nome e cognome');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'Controlla l’indirizzo email');
      // One registration per email, like the real app.
      const taken = store.guests.find((x) => x.registered && x.email === email);
      if (taken && nameKey(taken.name) !== nameKey(name)) {
        return { status: 409, body: { error: 'Questa email è già stata usata per registrarsi. Usa un indirizzo diverso oppure, se sei tu, accedi.', emailTaken: true } };
      }
      let g = taken || store.guests.find((x) => nameKey(x.name) === nameKey(name));
      if (!g) {
        // In the preview newcomers sit at "Tavolo 7", so the reveal has something to show.
        g = { id: store.nextId.guest++, name, email, tableId: 8, seat: '', registered: true, registeredAt: Date.now(), pushDevices: 0, notifiedAt: null, emailStatus: null };
        store.guests.push(g);
      }
      Object.assign(g, { email, registered: true, registeredAt: Date.now() });
      store.meId = g.id;
      save();
      return { ok: true, me: meJson(g) };
    }],

    ['POST', /^\/api\/login\/(request|verify|pick)$/, (b) => {
      const g = store.guests.find((x) => x.email && x.email === String(b.email || '').trim().toLowerCase());
      if (!g) return fail(404, 'Nessuna registrazione con questa email: registrati qui sopra!');
      store.meId = g.id;
      save();
      return { ok: true };
    }],

    ['POST', /^\/api\/logout$/, () => {
      store.meId = null;
      store.admin = false;
      save();
      return { ok: true };
    }],

    ['PATCH', /^\/api\/me$/, (b) => {
      const g = me();
      if (!g) return fail(401, 'Non registrato');
      g.name = String(b.name || g.name).trim();
      save();
      return { ok: true, me: meJson(g) };
    }],

    ['POST', /^\/api\/push\/subscribe$/, () => {
      store.pushEnabled = true;
      save();
      return { ok: true, pushDevices: 1 };
    }],
    ['POST', /^\/api\/push\/unsubscribe$/, () => ({ ok: true })],
    ['POST', /^\/api\/push\/test$/, () => {
      fakePush('🔔 Notifiche attive!', 'Perfetto, riceverai qui gli aggiornamenti del matrimonio.', '');
      return { ok: true, delivered: 1 };
    }],

    ['GET', /^\/api\/seating$/, () => {
      const nu = needUser();
      if (nu) return nu;
      const revealed = isRevealed();
      const out = { revealed, revealAt: S().revealAt, floorplan: S().floorplan };
      const g = me();
      if (revealed && g?.tableId) {
        const t = table(g.tableId);
        out.table = { id: t.id, name: t.name, description: t.description, x: t.x, y: t.y, shape: t.shape };
        out.seat = g.seat;
        out.mates = store.guests.filter((x) => x.tableId === t.id && x.id !== g.id).map((x) => x.name).sort();
      }
      if (revealed || store.admin) {
        out.tables = tableRows().map(({ id, name, x, y, shape, seats }) => ({ id, name, x, y, shape, seats }));
        out.entrance = S().hallEntrance;
      }
      return out;
    }],

    ['GET', /^\/api\/messages$/, (b, q) => {
      if (!boardOpen()) return fail(403, 'La chat LIVE non è ancora aperta');
      const limit = Math.min(Number(q.get('limit')) || 40, 100);
      const before = Number(q.get('before')) || Infinity;
      const after = Number(q.get('after')) || 0;
      let list = store.messages.filter((m) => !m.deleted && m.id < before && m.id > after);
      if (q.get('kind') === 'photo') list = list.filter((m) => m.kind === 'photo');
      list.sort((a, b2) => a.id - b2.id);
      const page = after ? list.slice(0, limit) : list.slice(-limit);
      return { messages: page.map(msgJson), hasMore: !after && list.length > limit };
    }],

    ['POST', /^\/api\/messages$/, (b) => {
      const nu = needUser();
      if (nu) return nu;
      if (!boardOpen()) return fail(403, 'La chat LIVE non è ancora aperta');
      const text = String(b.text || '').trim().slice(0, 1000);
      if (!text) return fail(400, 'Scrivi qualcosa');
      return { message: insertMessage({ ...author(), kind: 'text', text }) };
    }],

    ['POST', /^\/api\/messages\/(\d+)\/like$/, (b, q, m) => {
      const msg = store.messages.find((x) => x.id === Number(m[1]) && !x.deleted);
      if (!msg) return fail(404, 'Messaggio non trovato');
      const k = liker();
      const had = msg.likedBy.includes(k);
      msg.likedBy = had ? msg.likedBy.filter((x) => x !== k) : [...msg.likedBy, k];
      msg.likes = Math.max(0, msg.likes + (had ? -1 : 1));
      save();
      broadcast('like', { id: msg.id, likes: msg.likes });
      return { id: msg.id, likes: msg.likes, liked: !had };
    }],

    ['DELETE', /^\/api\/messages\/(\d+)$/, (b, q, m) => {
      const msg = store.messages.find((x) => x.id === Number(m[1]) && !x.deleted);
      if (!msg) return fail(404, 'Messaggio non trovato');
      const own = store.meId && msg.guestId === store.meId;
      if (!store.admin && !own) return fail(403, 'Non puoi eliminare questo messaggio');
      msg.deleted = true;
      save();
      broadcast('del', { id: msg.id });
      return { ok: true };
    }],

    /* ---------- Regia ---------- */

    ['POST', /^\/api\/admin\/login$/, (b) => {
      if (!String(b.password || '')) return fail(401, 'Password errata');
      store.admin = true;
      save();
      return { ok: true };
    }],
    ['POST', /^\/api\/admin\/logout$/, () => {
      store.admin = false;
      save();
      return { ok: true };
    }],
    ['*', /^\/api\/admin\//, () => (store.admin ? null : fail(401, 'Accesso riservato agli sposi'))],

    ['GET', /^\/api\/admin\/overview$/, () => ({
      settings: adminSettings(),
      stats: stats(),
      revealed: isRevealed(),
      emailEnabled: true,
      emailFromEnv: false,
      emailDev: false,
      publicUrl: DEMO_URL,
      accents: ACCENTS,
    })],

    ['PATCH', /^\/api\/admin\/settings$/, (b) => {
      const s = S();
      const keys = ['hallEntrance', 'coupleNames', 'weddingDate', 'tz', 'accent', 'nameFont', 'coverTone', 'welcomeTitle', 'welcomeText', 'sections', 'autoLiveAt', 'notifyOnLive', 'allowPhotos', 'allowChat', 'revealAt', 'revealMessage', 'adminEmail'];
      for (const k of keys) if (k in b) s[k] = b[k];
      if (!s.coupleNames) s.coupleNames = 'Niccolò & Beatrice';
      if (b.email) s.email = { ...s.email, ...b.email, pass: b.email.pass || s.email.pass };
      if ('revealAt' in b && (!b.revealAt || Date.parse(b.revealAt) > Date.now())) {
        s.revealAnnounced = false;
        store.guests.forEach(resetNotice);
      }
      save();
      makeAutoIcon();
      broadcast('settings', publicSettings());
      return { settings: adminSettings() };
    }],

    ['POST', /^\/api\/admin\/mode$/, (b) => {
      setMode(b.mode === 'live' ? 'live' : 'info', !!b.notify);
      return { settings: adminSettings() };
    }],

    ['POST', /^\/api\/admin\/reveal\/now$/, () => {
      S().revealAt = new Date().toISOString();
      S().revealAnnounced = false;
      save();
      broadcast('settings', publicSettings());
      setTimeout(doReveal, 300);
      return { settings: adminSettings() };
    }],
    ['POST', /^\/api\/admin\/reveal\/reset$/, () => ({ stats: stats() })],
    ['POST', /^\/api\/admin\/reveal\/preview$/, () => {
      setTimeout(emailPreview, 350);
      return { ok: true };
    }],
    ['POST', /^\/api\/admin\/email\/test$/, () => ({ ok: true })],

    ['POST', /^\/api\/admin\/announce$/, (b) => {
      const title = String(b.title || '').trim();
      const text = String(b.text || '').trim();
      if (!text) return fail(400, 'Scrivi il messaggio');
      S().lastAnnouncement = { title, text, at: Date.now() };
      save();
      broadcast('settings', publicSettings());
      if (b.post) insertMessage({ guestId: null, author: S().coupleNames, isAdmin: true, kind: 'announce', text: [title, text].filter(Boolean).join('\n') });
      if (b.push) setTimeout(() => fakePush(title || `📣 ${S().coupleNames}`, text, ''), 500);
      return { ok: true, pushed: stats().withPush, emails: b.email ? stats().registered : 0 };
    }],

    ['GET', /^\/api\/admin\/tables$/, () => ({ tables: tableRows() })],
    ['POST', /^\/api\/admin\/tables$/, (b) => {
      const name = String(b.name || '').trim();
      if (!name) return fail(400, 'Dai un nome al tavolo');
      store.tables.push({
        id: store.nextId.table++,
        name,
        description: String(b.description || ''),
        x: null,
        y: null,
        sort: store.tables.length + 1,
        shape: b.shape === 'rect' ? 'rect' : 'round',
        seats: Math.max(0, Math.min(30, Number(b.seats) || 0)),
      });
      save();
      return { tables: tableRows() };
    }],
    ['POST', /^\/api\/admin\/tables\/bulk$/, (b) => {
      const n = Math.max(0, Math.min(60, Number(b.count) || 0));
      const prefix = String(b.prefix || 'Tavolo').trim() || 'Tavolo';
      const seats = Math.max(0, Math.min(30, Number(b.seats) || 0));
      if (b.couple && !store.tables.some((t) => t.shape === 'rect' || /spos/i.test(t.name))) {
        store.tables.forEach((t) => t.sort++);
        store.tables.push({ id: store.nextId.table++, name: 'Sposi', description: '', x: null, y: null, sort: 0, shape: 'rect', seats: 2 });
      }
      const names = new Set(store.tables.map((t) => t.name.toLowerCase()));
      for (let i = 1, made = 0; made < n; i++) {
        const name = `${prefix} ${i}`;
        if (names.has(name.toLowerCase())) continue;
        store.tables.push({ id: store.nextId.table++, name, description: '', x: null, y: null, sort: store.tables.length + 1, shape: 'round', seats });
        made++;
      }
      save();
      return { tables: tableRows() };
    }],
    ['POST', /^\/api\/admin\/tables\/arrange$/, () => {
      arrangeTables([...store.tables].sort((a, b2) => a.sort - b2.sort));
      save();
      return { tables: tableRows() };
    }],
    ['POST', /^\/api\/admin\/tables\/order$/, (b) => {
      (b.ids || []).forEach((id, i) => {
        const t = table(Number(id));
        if (t) t.sort = i + 1;
      });
      save();
      return { tables: tableRows() };
    }],
    ['PATCH', /^\/api\/admin\/tables\/(\d+)$/, (b, q, m) => {
      const t = table(Number(m[1]));
      if (!t) return fail(404, 'Tavolo non trovato');
      if (b.name !== undefined) t.name = String(b.name).trim() || t.name;
      if (b.description !== undefined) t.description = String(b.description);
      if (b.x !== undefined) t.x = b.x;
      if (b.y !== undefined) t.y = b.y;
      if (b.shape !== undefined) t.shape = b.shape === 'rect' ? 'rect' : 'round';
      if (b.seats !== undefined) t.seats = Math.max(0, Math.min(30, Number(b.seats) || 0));
      save();
      return { tables: tableRows() };
    }],
    ['DELETE', /^\/api\/admin\/tables\/(\d+)$/, (b, q, m) => {
      const id = Number(m[1]);
      store.tables = store.tables.filter((t) => t.id !== id);
      store.guests.forEach((g) => {
        if (g.tableId === id) {
          g.tableId = null;
          resetNotice(g);
        }
      });
      save();
      return { tables: tableRows() };
    }],

    ['GET', /^\/api\/admin\/guests$/, () => ({ guests: guestRows() })],
    ['POST', /^\/api\/admin\/guests\/import$/, (b) => {
      const res = { created: 0, updated: 0, tablesCreated: 0 };
      for (const row of b.rows || []) {
        const name = String(row.name || '').trim().replace(/\s+/g, ' ');
        if (name.length < 2) continue;
        const t = row.table ? findOrCreateTable(row.table) : null;
        if (t?.created) res.tablesCreated++;
        const g = store.guests.find((x) => nameKey(x.name) === nameKey(name));
        if (g) {
          if (t) g.tableId = t.id;
          if (row.seat) g.seat = row.seat;
          if (row.email && !g.email) g.email = row.email;
          resetNotice(g);
          res.updated++;
        } else {
          store.guests.push({ id: store.nextId.guest++, name, email: row.email || null, tableId: t?.id ?? null, seat: row.seat || '', registered: false, registeredAt: null, pushDevices: 0, notifiedAt: null, emailStatus: null });
          res.created++;
        }
      }
      save();
      return { ...res, guests: guestRows(), tables: tableRows() };
    }],
    ['POST', /^\/api\/admin\/guests\/assign$/, (b) => {
      const tableId = Number(b.tableId) || null;
      let changed = 0;
      for (const id of b.guestIds || []) {
        const g = store.guests.find((x) => x.id === Number(id));
        if (!g || g.tableId === tableId) continue;
        g.tableId = tableId;
        resetNotice(g);
        changed++;
      }
      save();
      broadcast('seating', {});
      return { changed, guests: guestRows(), tables: tableRows() };
    }],
    ['POST', /^\/api\/admin\/guests\/(\d+)\/resend$/, (b, q, m) => {
      const g = store.guests.find((x) => x.id === Number(m[1]));
      if (g) resetNotice(g);
      save();
      return { ok: true };
    }],
    ['POST', /^\/api\/admin\/guests$/, (b) => {
      const name = String(b.name || '').trim();
      if (name.length < 2) return fail(400, 'Scrivi nome e cognome');
      store.guests.push({ id: store.nextId.guest++, name, email: b.email || null, tableId: Number(b.tableId) || null, seat: b.seat || '', registered: false, registeredAt: null, pushDevices: 0, notifiedAt: null, emailStatus: null });
      save();
      return { guests: guestRows() };
    }],
    ['PATCH', /^\/api\/admin\/guests\/(\d+)$/, (b, q, m) => {
      const g = store.guests.find((x) => x.id === Number(m[1]));
      if (!g) return fail(404, 'Invitato non trovato');
      const before = `${g.tableId}|${g.seat}`;
      if (b.name !== undefined) g.name = String(b.name).trim() || g.name;
      if (b.email !== undefined) g.email = b.email || null;
      if (b.tableId !== undefined) g.tableId = Number(b.tableId) || null;
      if (b.seat !== undefined) g.seat = String(b.seat);
      if (before !== `${g.tableId}|${g.seat}`) {
        resetNotice(g);
        if (isRevealed() && g.tableId && (g.registered || g.email)) {
          g.notifiedAt = Date.now();
          g.emailStatus = g.email ? 'sent' : 'no-email';
        }
      }
      save();
      broadcast('seating', {});
      return { guest: guestRows().find((x) => x.id === g.id) };
    }],
    ['DELETE', /^\/api\/admin\/guests\/(\d+)$/, (b, q, m) => {
      store.guests = store.guests.filter((x) => x.id !== Number(m[1]));
      save();
      return { guests: guestRows() };
    }],

    ['DELETE', /^\/api\/admin\/upload\/(cover|floorplan)$/, (b, q, m) => {
      S()[m[1] === 'cover' ? 'coverImage' : 'floorplan'] = null;
      save();
      broadcast('settings', publicSettings());
      return { settings: adminSettings() };
    }],
    ['DELETE', /^\/api\/admin\/icon$/, () => {
      S().customIcon = false;
      S().iconVersion++;
      store.iconUrl = null;
      save();
      return { settings: adminSettings() };
    }],
  ];

  // Multipart uploads (photos, cover, floor plan, icon) arrive as FormData via XHR.
  const readAsDataURL = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Lettura del file non riuscita'));
      r.readAsDataURL(blob);
    });

  const UPLOADS = [
    [/^\/api\/admin\/upload\/section$/, async (form) => ({ file: await readAsDataURL(form.get('file')) })],
    [/^\/api\/photos$/, async (form) => {
      const nu = needUser();
      if (nu) return nu;
      const thumb = await readAsDataURL(form.get('thumb') || form.get('photo'));
      return {
        message: insertMessage({
          ...author(),
          kind: 'photo',
          text: String(form.get('caption') || ''),
          photo: thumb,
          thumb,
          w: Number(form.get('w')) || null,
          h: Number(form.get('h')) || null,
        }),
      };
    }],
    [/^\/api\/admin\/upload\/(cover|floorplan)$/, async (form, m) => {
      S()[m[1] === 'cover' ? 'coverImage' : 'floorplan'] = await readAsDataURL(form.get('file'));
      save();
      broadcast('settings', publicSettings());
      return { settings: adminSettings() };
    }],
    [/^\/api\/admin\/icon$/, async (form) => {
      store.iconUrl = await readAsDataURL(form.get('i192'));
      S().customIcon = form.get('kind') === 'photo' ? 'photo' : 'monogram';
      S().iconVersion++;
      save();
      broadcast('settings', publicSettings());
      return { settings: adminSettings() };
    }],
  ];

  function handle(method, url, body) {
    const u = new URL(url, 'https://demo.local');
    for (const [m, re, fn] of ROUTES) {
      const match = u.pathname.match(re);
      if (!match || (m !== '*' && m !== method)) continue;
      const out = fn(body || {}, u.searchParams, match);
      if (out === null) continue; // guard passed
      if (out && out.status && out.body) return out;
      return { status: 200, body: out };
    }
    return { status: 404, body: { error: 'Non disponibile nell’anteprima' } };
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return realFetch(input, init);
    let body = null;
    try {
      body = init.body ? JSON.parse(init.body) : null;
    } catch {
      body = null;
    }
    await new Promise((r) => setTimeout(r, 90));
    const res = handle((init.method || 'GET').toUpperCase(), url, body);
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  };

  class DemoXHR {
    constructor() {
      this.upload = {};
      this.status = 0;
      this.response = null;
      this.responseType = '';
    }
    open(method, url) {
      this.url = url;
    }
    async send(form) {
      const u = new URL(this.url, 'https://demo.local');
      for (let p = 0.25; p <= 1; p += 0.25) {
        await new Promise((r) => setTimeout(r, 120));
        this.upload.onprogress?.({ lengthComputable: true, loaded: p * 100, total: 100 });
      }
      try {
        let out = store.admin || !u.pathname.startsWith('/api/admin/') ? null : fail(401, 'Accesso riservato agli sposi');
        if (!out) {
          for (const [re, fn] of UPLOADS) {
            const m = u.pathname.match(re);
            if (m) {
              out = await fn(form, m);
              break;
            }
          }
        }
        out ||= fail(404, 'Non disponibile nell’anteprima');
        this.status = out.status && out.body ? out.status : 200;
        this.response = out.status && out.body ? out.body : out;
        this.onload?.();
      } catch (err) {
        this.status = 500;
        this.response = { error: err.message };
        this.onload?.();
      }
    }
  }
  window.XMLHttpRequest = DemoXHR;

  /* ---------------------------------------------------------------- */
  /* Hooks used by the app in demo mode, demo bar, blocked actions      */
  /* ---------------------------------------------------------------- */

  window.__DEMO = {
    pushState: async () => (store.pushEnabled ? 'enabled' : 'off'),
    enablePush: async () => {
      store.pushEnabled = true;
      save();
      setTimeout(() => fakePush('🔔 Notifiche attive!', 'Riceverai qui gli aggiornamenti del matrimonio.', ''), 300);
    },
    get icon() {
      return store.iconUrl || autoIcon || null;
    },
    host: DEMO_URL.replace(/^https?:\/\//, ''),
  };

  function switchRole(role) {
    if (role === 'admin') {
      store.admin = true;
      store.startHash = 'admin';
    } else {
      store.admin = false;
      store.startHash = '';
    }
    save();
    location.reload();
  }

  document.addEventListener(
    'click',
    (e) => {
      const role = e.target.closest('[data-demo-role]');
      if (role) return switchRole(role.dataset.demoRole);
      if (e.target.closest('[data-demo-reset]')) {
        try {
          localStorage.removeItem(KEY);
        } catch {
          /* ignore */
        }
        store = seed();
        save();
        location.reload();
        return;
      }
      const blocked = e.target.closest('a[href^="/api/"], a[download], #print, .lightbox [data-save]');
      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
        toast('Nell’anteprima i download sono disattivati: nell’app vera funzionano.');
      }
    },
    true,
  );

  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.getElementById('demo-bar');
    if (!bar) return;
    bar.querySelector(`[data-demo-role="${store.admin ? 'admin' : 'guest'}"]`)?.classList.add('on');
  });
})();
