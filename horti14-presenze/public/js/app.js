// Presenze Horti 14: the employee's monthly calendar and the owner's console.
import { $, $$, esc, api, download, toast, toastError, sheet, confirmSheet, busy, icon, iosShareIcon } from './ui.js';
import { CODES, monthLabel, monthName, dayLabel, shortDay, stamp, addMonths, monthDays, weekday, isMonth, describeEntry, monthOf } from './cal.js';
import { describeEvent, eventIcon } from './events.js';

const DEMO = window.__DEMO || null;
const app = $('#app');
const S = { me: null, company: 'Horti 14', today: '', vapid: '', emailEnabled: false };

const MIN_PASSWORD = 8;
const WD = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const PERM_HOURS = [null, 1, 2, 3, 4, 5, 6, 7];
const hoursText = (h) => `${String(h).replace('.', ',')} h`;
const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

/* ------------------------------------------------------------------ */
/* Boot & routing                                                      */
/* ------------------------------------------------------------------ */

async function loadMe() {
  const me = await api('/api/me');
  S.me = me.user;
  S.company = me.company;
  S.today = me.today;
  S.vapid = me.vapidPublicKey;
  S.emailEnabled = me.emailEnabled;
}

function go(hash) {
  if (location.hash === (hash === '#' ? '' : hash)) route();
  else location.hash = hash;
}

async function route() {
  const [name = '', ...args] = decodeURIComponent(location.hash.slice(1).split('?')[0]).split('/');
  window.scrollTo(0, 0);
  try {
    if (name === 'accesso') return await renderAccess(args[0]);
    if (!S.me) return name === 'password-dimenticata' ? renderForgot() : renderLogin();
    if (S.me.role === 'admin') {
      if (name === 'dipendente') return await renderAdminEmployee(Number(args[0]), args[1]);
      if (name === 'dipendenti') return await renderEmployees();
      if (name === 'registro') return await renderAudit();
      if (name === 'impostazioni') return await renderSettings();
      return await renderOverview(isMonth(args[0]) ? args[0] : monthOf(S.today));
    }
    return await renderMyMonth(isMonth(args[0]) ? args[0] : monthOf(S.today));
  } catch (err) {
    if (err.status === 401) {
      S.me = null;
      return renderLogin();
    }
    app.innerHTML = shell('', `<div class="empty">${icon('alert')}<p>${esc(err.message)}</p><button class="btn btn-primary" data-retry>Riprova</button></div>`);
    $('[data-retry]').onclick = route;
  }
}

async function boot() {
  try {
    await loadMe();
  } catch (err) {
    app.innerHTML = `<div class="empty">${icon('alert')}<p>${esc(err.message)}</p><button class="btn btn-primary" onclick="location.reload()">Riprova</button></div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();
  registerServiceWorker();
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const brand = () => `<div class="brand"><span class="brand-name">${esc(S.company.toUpperCase())}</span><span class="brand-sub">Presenze</span></div>`;

const TABS = [
  ['mese', 'Mese', 'calendar'],
  ['dipendenti', 'Dipendenti', 'users'],
  ['registro', 'Registro', 'shield'],
  ['impostazioni', 'Impostazioni', 'sliders'],
];

function shell(active, content) {
  const admin = S.me?.role === 'admin';
  const tabs = admin
    ? `<nav class="tabs" aria-label="Sezioni">${TABS.map(
        ([key, label, ic]) =>
          `<a href="#${key}" class="tab${active === key ? ' on' : ''}"${active === key ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`,
      ).join('')}</nav>`
    : '';
  const who = S.me
    ? `<button class="avatar" data-profile aria-label="Il mio profilo">${esc(initials(`${S.me.firstName} ${S.me.lastName}`))}</button>`
    : '';
  return `
    <header class="topbar"><div class="topbar-in">${brand()}${admin ? tabs : ''}${who}</div></header>
    <main class="main${admin ? ' main-admin' : ''}">${content}</main>
    ${admin ? tabs.replace('class="tabs"', 'class="tabs tabs-bottom"') : ''}`;
}

function mount(active, content) {
  app.innerHTML = shell(active, content);
  $('[data-profile]')?.addEventListener('click', openProfile);
}

/* ------------------------------------------------------------------ */
/* Login, activation, forgotten password                               */
/* ------------------------------------------------------------------ */

function authPage(content) {
  app.innerHTML = `<main class="auth"><div class="auth-card">${brand()}${content}</div></main>`;
}

function renderLogin() {
  authPage(`
    <h1 class="auth-title">Accedi</h1>
    <form class="form" data-login novalidate>
      <label class="field"><span>Email</span><input type="email" name="email" autocomplete="username" inputmode="email" required autofocus></label>
      <label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>
      <button class="btn btn-primary btn-block" type="submit">Entra</button>
    </form>
    <p class="auth-links"><a href="#password-dimenticata">Password dimenticata?</a></p>
    <p class="auth-note">Primo accesso? Apri il link personale che hai ricevuto dal titolare.</p>`);
  const form = $('[data-login]');
  form.onsubmit = (e) => {
    e.preventDefault();
    busy(form.querySelector('button'), async () => {
      const { user } = await api('/api/login', { method: 'POST', body: { email: form.email.value, password: form.password.value } });
      S.me = user;
      go('#');
    });
  };
}

function renderForgot() {
  authPage(`
    <h1 class="auth-title">Password dimenticata</h1>
    <p class="auth-text">Scrivi la tua email: ti mandiamo un link per sceglierne una nuova.</p>
    <form class="form" data-forgot novalidate>
      <label class="field"><span>Email</span><input type="email" name="email" autocomplete="username" inputmode="email" required autofocus></label>
      <button class="btn btn-primary btn-block" type="submit">Mandami il link</button>
    </form>
    <p class="auth-links"><a href="#">Torna all'accesso</a></p>`);
  const form = $('[data-forgot]');
  form.onsubmit = (e) => {
    e.preventDefault();
    busy(form.querySelector('button'), async () => {
      const out = await api('/api/forgot', { method: 'POST', body: { email: form.email.value } });
      form.outerHTML = out.emailEnabled
        ? `<div class="notice notice-ok">${icon('mail')}<p>Se l'indirizzo è registrato, tra poco ricevi un'email con il link (controlla anche lo spam). Il link vale un'ora.</p></div>`
        : `<div class="notice notice-warn">${icon('info')}<p>Le email non sono ancora attive: chiedi al titolare un nuovo link di accesso.</p></div>`;
    });
  };
}

async function renderAccess(token) {
  let info;
  try {
    info = await api('/api/access/info', { method: 'POST', body: { token } });
  } catch (err) {
    authPage(`<div class="notice notice-warn">${icon('alert')}<p>${esc(err.message)}</p></div><p class="auth-links"><a href="#">Vai all'accesso</a></p>`);
    return;
  }
  authPage(`
    <h1 class="auth-title">${info.reset ? 'Nuova password' : `Ciao ${esc(info.firstName)}!`}</h1>
    <p class="auth-text">${info.reset ? 'Scegli la nuova password per' : 'Scegli la tua password personale. Entrerai con'} <b>${esc(info.email)}</b>.</p>
    <form class="form" data-access novalidate>
      <input type="email" name="username" value="${esc(info.email)}" autocomplete="username" hidden>
      <label class="field"><span>Password (almeno ${MIN_PASSWORD} caratteri)</span><input type="password" name="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required autofocus></label>
      <label class="field"><span>Ripeti la password</span><input type="password" name="again" autocomplete="new-password" required></label>
      <button class="btn btn-primary btn-block" type="submit">${info.reset ? 'Salva e entra' : 'Attiva e entra'}</button>
    </form>
    <p class="auth-note">La password è solo tua: nemmeno il titolare la conosce. Così ogni presenza è certificata a tuo nome.</p>`);
  const form = $('[data-access]');
  form.onsubmit = (e) => {
    e.preventDefault();
    if (form.password.value.length < MIN_PASSWORD) return toast(`La password deve avere almeno ${MIN_PASSWORD} caratteri`, 'error');
    if (form.password.value !== form.again.value) return toast('Le due password non coincidono', 'error');
    busy(form.querySelector('button'), async () => {
      const { user } = await api('/api/access', { method: 'POST', body: { token, password: form.password.value } });
      S.me = user;
      history.replaceState(null, '', location.pathname);
      toast(info.reset ? 'Password aggiornata' : 'Benvenuto! Il tuo account è attivo');
      route();
      if (user.role === 'employee') setTimeout(offerPush, 800);
    });
  };
}

/* ------------------------------------------------------------------ */
/* Calendar editor (employee's own month, or the owner editing one)    */
/* ------------------------------------------------------------------ */

function calendarHtml(data, { editable }) {
  const days = monthDays(data.month);
  const lead = (weekday(days[0]) + 6) % 7;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="cal-pad" aria-hidden="true"></div>');
  for (const day of days) {
    const e = data.entries[day];
    const c = e ? CODES[e.code] : null;
    const label = `${dayLabel(day)}: ${e ? describeEntry(e) : 'nulla segnato'}`;
    cells.push(`
      <button class="cal-day${e ? ` has code-${e.code}` : ''}${day === data.today ? ' today' : ''}${weekday(day) % 6 === 0 ? ' weekend' : ''}"
        data-day="${day}" ${editable ? '' : 'disabled'} aria-label="${esc(label)}">
        <span class="cal-n">${+day.slice(8)}</span>
        ${c ? `<span class="cal-code">${c.short}${e.hours ? `<small>${esc(hoursText(e.hours))}</small>` : ''}</span>` : ''}
        ${e?.note ? '<span class="cal-note" aria-hidden="true"></span>' : ''}
      </button>`);
  }
  return `<div class="cal" role="group" aria-label="Giorni di ${esc(monthLabel(data.month))}">
    ${WD.map((w, i) => `<div class="cal-wd${i > 4 ? ' weekend' : ''}" aria-hidden="true">${w}</div>`).join('')}
    ${cells.join('')}
  </div>`;
}

function totalsHtml(t) {
  return `<div class="totals">${Object.entries(CODES)
    .map(
      ([k, c]) => `<div class="total" style="--c:${c.color}"><b>${t[k]}</b><span>${c.plural}${k === 'P' && t.permHours ? ` <small>(${hoursText(t.permHours)})</small>` : ''}</span></div>`,
    )
    .join('')}</div>`;
}

function statusHtml(data, { admin, name }) {
  const due = dayLabel(data.deadline);
  if (data.state === 'ok') {
    return `<div class="status status-ok">${icon('check')}<div><b>Mese confermato</b><span>il ${esc(stamp(data.confirmedAt, { seconds: false }))} · ricevuta n. ${data.receiptId}</span></div></div>`;
  }
  const lateCls = data.late ? 'status-late' : data.dueToday ? 'status-today' : 'status-todo';
  const title =
    data.state === 'changed'
      ? 'Modificato dopo la conferma'
      : data.late
        ? 'In ritardo'
        : data.dueToday
          ? 'Scade oggi!'
          : 'Da confermare';
  const sub =
    data.state === 'changed'
      ? admin
        ? `${esc(name)} deve confermarlo di nuovo (scadenza ${esc(due)})`
        : 'Controlla e conferma di nuovo'
      : data.late
        ? `La scadenza era ${esc(due)}`
        : data.dueToday
          ? `${admin ? 'Deve confermare' : 'Conferma'} entro stasera`
          : `Entro ${esc(due)}`;
  return `<div class="status ${lateCls}">${icon(data.late ? 'alert' : 'clock')}<div><b>${title}</b><span>${sub}</span></div></div>`;
}

/**
 * Month editor. opts: { load(), save(days, entry), confirm?(), history(), admin, name, navHash(month) }
 */
async function monthEditor(root, opts) {
  let data = await opts.load();
  let brush = null;
  let permHours = null;
  let queue = Promise.resolve();
  let pending = 0;

  function paletteHtml() {
    const chips = Object.entries(CODES)
      .map(
        ([k, c]) =>
          `<button class="chip${brush === k ? ' on' : ''}" data-brush="${k}" style="--c:${c.color}" aria-pressed="${brush === k}"><span class="chip-dot">${c.short}</span>${c.label}</button>`,
      )
      .join('');
    const hours =
      brush === 'P'
        ? `<div class="hours" role="group" aria-label="Durata del permesso">${PERM_HOURS.map(
            (h) => `<button class="mini${permHours === h ? ' on' : ''}" data-hours="${h ?? ''}" aria-pressed="${permHours === h}">${h ? hoursText(h) : 'Giornata intera'}</button>`,
          ).join('')}</div>`
        : '';
    return `
      <p class="hint">${brush ? (brush === 'clear' ? 'Tocca i giorni da svuotare' : `Tocca i giorni da segnare come <b>${CODES[brush].label.toLowerCase()}</b>`) : 'Scegli cosa segnare, poi tocca i giorni. Oppure tocca un giorno per i dettagli.'}</p>
      <div class="chips" role="toolbar" aria-label="Cosa segnare">${chips}
        <button class="chip chip-clear${brush === 'clear' ? ' on' : ''}" data-brush="clear" aria-pressed="${brush === 'clear'}">${icon('eraser')}Svuota</button>
      </div>${hours}`;
  }

  function render() {
    const editable = data.editable;
    const prev = addMonths(data.month, -1);
    const next = addMonths(data.month, 1);
    root.innerHTML = `
      <div class="month-nav">
        <a class="icon-btn" href="${opts.navHash(prev)}" aria-label="${esc(monthLabel(prev))}">${icon('left')}</a>
        <h1 class="month-title">${esc(monthLabel(data.month))}</h1>
        <a class="icon-btn" href="${opts.navHash(next)}" aria-label="${esc(monthLabel(next))}">${icon('right')}</a>
      </div>
      ${statusHtml(data, opts)}
      ${editable ? '' : `<div class="notice">${icon('info')}<p>${opts.admin ? 'Mese fuori dal periodo modificabile.' : 'Questo mese è chiuso: per correzioni chiedi al titolare.'}</p></div>`}
      ${opts.admin && editable ? `<div class="notice notice-soft">${icon('shield')}<p>Le tue modifiche vengono registrate a tuo nome nel registro${data.state === 'ok' ? `; ${esc(opts.name)} dovrà poi riconfermare il mese` : ''}.</p></div>` : ''}
      ${editable ? `<div class="palette" data-palette>${paletteHtml()}</div>` : ''}
      <div data-cal>${calendarHtml(data, { editable })}</div>
      <div data-totals>${totalsHtml(data.totals)}</div>
      ${
        opts.confirm && editable
          ? `<div class="confirm-bar"><button class="btn ${data.state === 'ok' ? 'btn-ghost' : 'btn-primary'} btn-block" data-confirm ${data.state === 'ok' ? 'disabled' : ''}>
              ${icon('check')} ${data.state === 'ok' ? 'Mese confermato' : data.state === 'changed' ? 'Conferma di nuovo' : `Conferma ${esc(monthName(data.month))}`}</button></div>`
          : ''
      }
      <button class="link-btn" data-history>${icon('clock')} Cronologia delle modifiche</button>`;
    bind();
  }

  function refreshParts() {
    $('[data-cal]', root).innerHTML = calendarHtml(data, { editable: data.editable });
    $('[data-totals]', root).innerHTML = totalsHtml(data.totals);
  }

  function bind() {
    $('[data-palette]', root)?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-brush]');
      const h = e.target.closest('[data-hours]');
      if (b) {
        brush = brush === b.dataset.brush ? null : b.dataset.brush;
        if (brush !== 'P') permHours = null;
      } else if (h) permHours = h.dataset.hours ? Number(h.dataset.hours) : null;
      else return;
      $('[data-palette]', root).innerHTML = paletteHtml();
    });
    $('[data-cal]', root).addEventListener('click', (e) => {
      const cell = e.target.closest('[data-day]');
      if (!cell || cell.disabled) return;
      if (brush) paint(cell.dataset.day);
      else openDay(cell.dataset.day);
    });
    $('[data-confirm]', root)?.addEventListener('click', confirmMonth);
    $('[data-history]', root).addEventListener('click', () => openHistory(opts, data.month));
  }

  /** Save through a serial queue: taps are instant, requests go one after the other. */
  function save(days, entry) {
    for (const d of days) {
      if (entry) data.entries[d] = entry;
      else delete data.entries[d];
    }
    data.totals = recount(data.entries);
    refreshParts();
    pending++;
    queue = queue
      .then(() => opts.save(days, entry))
      .then((fresh) => {
        pending--;
        if (!pending) {
          const stateChanged = fresh.state !== data.state;
          data = fresh;
          if (stateChanged) render();
          else refreshParts();
        }
      })
      .catch(async (err) => {
        pending--;
        toastError(err);
        data = await opts.load().catch(() => data);
        render();
      });
    return queue;
  }

  function paint(day) {
    const cur = data.entries[day];
    let entry = null;
    if (brush !== 'clear') {
      entry = { code: brush };
      if (brush === 'P' && permHours) entry.hours = permHours;
      const same = cur && cur.code === entry.code && (cur.hours ?? null) === (entry.hours ?? null);
      if (same) entry = null;
      else if (cur?.note && cur.code === entry.code) entry.note = cur.note;
    }
    if (!entry && !cur) return;
    navigator.vibrate?.(8);
    save([day], entry);
  }

  function openDay(day) {
    const cur = data.entries[day] || null;
    let code = cur?.code || null;
    let hours = cur?.hours ?? null;
    sheet(
      (el, close) => {
        const draw = () => {
          el.innerHTML = `
            <h2 class="sheet-title">${esc(dayLabel(day))}</h2>
            <div class="day-codes">${Object.entries(CODES)
              .map(
                ([k, c]) => `<button class="day-code${code === k ? ' on' : ''}" data-code="${k}" style="--c:${c.color}" aria-pressed="${code === k}"><span class="chip-dot">${c.short}</span>${c.label}</button>`,
              )
              .join('')}</div>
            ${
              code === 'P'
                ? `<div class="hours" role="group" aria-label="Durata del permesso">${PERM_HOURS.map(
                    (h) => `<button class="mini${hours === h ? ' on' : ''}" data-h="${h ?? ''}" aria-pressed="${hours === h}">${h ? hoursText(h) : 'Giornata intera'}</button>`,
                  ).join('')}</div>`
                : ''
            }
            <label class="field"><span>Nota (facoltativa)</span>
              <input name="note" maxlength="200" value="${esc(el.querySelector('[name=note]')?.value ?? cur?.note ?? '')}" placeholder="${code === 'M' ? 'Es. n. di protocollo del certificato' : 'Es. cambio turno, mezza giornata…'}"></label>
            <div class="sheet-actions">
              ${cur ? '<button class="btn btn-ghost" data-clear>Svuota giorno</button>' : '<button class="btn btn-ghost" data-cancel>Annulla</button>'}
              <button class="btn btn-primary" data-save ${code ? '' : 'disabled'}>Salva</button>
            </div>`;
          el.querySelectorAll('[data-code]').forEach((b) => (b.onclick = () => ((code = b.dataset.code), code !== 'P' && (hours = null), draw())));
          el.querySelectorAll('[data-h]').forEach((b) => (b.onclick = () => ((hours = b.dataset.h ? Number(b.dataset.h) : null), draw())));
          el.querySelector('[data-cancel]')?.addEventListener('click', () => close());
          el.querySelector('[data-clear]')?.addEventListener('click', () => {
            save([day], null);
            close();
          });
          el.querySelector('[data-save]').onclick = () => {
            const entry = { code };
            if (code === 'P' && hours) entry.hours = hours;
            const note = el.querySelector('[name=note]').value.trim();
            if (note) entry.note = note;
            save([day], entry);
            close();
          };
        };
        draw();
      },
      { label: dayLabel(day) },
    );
  }

  async function confirmMonth() {
    const empty = monthDays(data.month).filter((d) => !data.entries[d]).length;
    const t = data.totals;
    const ok = await confirmSheet({
      title: `Confermi le presenze di ${monthLabel(data.month)}?`,
      body: `${totalsHtml(t)}
        ${empty ? `<p class="muted">${empty} giorn${empty === 1 ? 'o' : 'i'} senza nulla: ${empty === 1 ? 'vale' : 'valgono'} come riposo.</p>` : ''}
        <p class="muted">Riceverai una ricevuta via email. Se poi dovrai correggere qualcosa potrai farlo, e confermerai di nuovo.</p>`,
      ok: 'Sì, confermo',
    });
    if (!ok) return;
    await busy($('[data-confirm]', root), async () => {
      const out = await opts.confirm();
      data = out;
      render();
      sheet((el, close) => {
        el.innerHTML = `
          <div class="done">${icon('check')}</div>
          <h2 class="sheet-title center">Fatto, grazie!</h2>
          <p class="center">Presenze di ${esc(monthLabel(data.month))} confermate il <b>${esc(stamp(out.receipt.at))}</b>.</p>
          <p class="center muted">Ricevuta n. ${out.receipt.id}${S.emailEnabled ? ' · te l’abbiamo mandata anche via email' : ''}</p>
          <div class="sheet-actions"><button class="btn btn-primary btn-block" data-ok>Chiudi</button></div>`;
        el.querySelector('[data-ok]').onclick = () => close();
      });
    });
  }

  render();
}

function recount(entries) {
  const t = { L: 0, F: 0, P: 0, M: 0, permHours: 0 };
  for (const e of Object.values(entries)) {
    t[e.code]++;
    if (e.code === 'P' && e.hours) t.permHours += e.hours;
  }
  return t;
}

async function openHistory(opts, month) {
  const { events } = await opts.history().catch((err) => (toastError(err), { events: null }));
  if (!events) return;
  sheet(
    (el, close) => {
      el.innerHTML = `
        <h2 class="sheet-title">Cronologia · ${esc(monthLabel(month))}</h2>
        <p class="muted small">Ogni modifica è registrata con data, ora e autore, e non si può cancellare.</p>
        <ol class="events">${events.length ? events.map((e) => eventHtml(e, { compact: true })).join('') : '<li class="muted">Ancora nessuna modifica.</li>'}</ol>
        <div class="sheet-actions"><button class="btn btn-primary btn-block" data-ok>Chiudi</button></div>`;
      el.querySelector('[data-ok]').onclick = () => close();
    },
    { wide: true, label: 'Cronologia' },
  );
}

function deviceOf(ua = '') {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(' · ');
}

function eventHtml(e, { compact = false } = {}) {
  const self = e.actorId && e.actorId === e.subjectId;
  const who = compact ? (self ? '' : e.actor) : e.actor;
  const meta = [who, !compact && e.subject && !self ? `per ${e.subject}` : '', deviceOf(e.ua), e.ip && e.ip !== 'server' ? `IP ${e.ip}` : '']
    .filter(Boolean)
    .map(esc)
    .join(' · ');
  return `<li class="event">
    <span class="event-ic" aria-hidden="true">${eventIcon(e.action)}</span>
    <div class="event-body">
      <div class="event-text">${esc(describeEvent(e))}</div>
      <div class="event-meta"><time>${esc(stamp(e.at))}</time>${meta ? ` · ${meta}` : ''}</div>
      <div class="event-hash" title="Impronta SHA-256 dell'evento">n. ${e.id} · ${esc(e.hash.slice(0, 16))}…</div>
    </div></li>`;
}

/* ------------------------------------------------------------------ */
/* Employee                                                            */
/* ------------------------------------------------------------------ */

async function renderMyMonth(month) {
  mount('', `<div class="hello">Ciao ${esc(S.me.firstName)} 👋</div><section data-editor class="editor"><div class="loading"></div></section><div data-push></div>`);
  const base = `/api/month/${month}`;
  await monthEditor($('[data-editor]'), {
    load: () => api(base),
    save: (days, entry) => api(`${base}/days`, { method: 'PUT', body: { days, entry } }),
    confirm: () => api(`${base}/confirm`, { method: 'POST' }),
    history: () => api(`${base}/history`),
    navHash: (m) => `#mese/${m}`,
  });
  pushCard($('[data-push]'));
}

/* ------------------------------------------------------------------ */
/* Owner: month overview                                               */
/* ------------------------------------------------------------------ */

let overviewView = (() => {
  try {
    return localStorage.getItem('h14-view') || 'list';
  } catch {
    return 'list';
  }
})();

function pill(r) {
  if (!r.active) return '<span class="pill pill-off">Disattivato</span>';
  if (!r.activated) return '<span class="pill pill-off">Invito in attesa</span>';
  if (r.state === 'ok') return '<span class="pill pill-ok">Confermato</span>';
  if (r.late) return `<span class="pill pill-late">${r.state === 'changed' ? 'Da riconfermare' : 'In ritardo'}</span>`;
  if (r.state === 'changed') return '<span class="pill pill-warn">Da riconfermare</span>';
  if (r.dueToday) return '<span class="pill pill-warn">Scade oggi</span>';
  return '<span class="pill pill-todo">Da confermare</span>';
}

function gridHtml(o) {
  const days = monthDays(o.month);
  return `<div class="grid-wrap"><table class="grid">
    <caption class="print-only">Presenze ${esc(S.company)} · ${esc(monthLabel(o.month))}</caption>
    <thead><tr><th class="g-name">Dipendente</th>${days
      .map((d) => `<th class="${weekday(d) % 6 === 0 ? 'weekend' : ''}${d === o.today ? ' today' : ''}"><span>${WD[(weekday(d) + 6) % 7]}</span>${+d.slice(8)}</th>`)
      .join('')}${Object.values(CODES)
      .map((c) => `<th class="g-tot" title="${c.label}">${c.short}</th>`)
      .join('')}</tr></thead>
    <tbody>${o.employees
      .map(
        (r) => `<tr data-open="${r.id}">
          <th class="g-name">${esc(r.name)}<small>${r.state === 'ok' ? '✓ confermato' : r.late ? 'in ritardo' : r.state === 'changed' ? 'da riconfermare' : ''}</small></th>
          ${days
            .map((d) => {
              const e = r.entries[d];
              return `<td class="${weekday(d) % 6 === 0 ? 'weekend' : ''}${e ? ` code-${e.code}` : ''}" ${e ? `title="${esc(describeEntry(e))}"` : ''}>${e ? CODES[e.code].short + (e.hours ? `<small>${e.hours}</small>` : '') : ''}</td>`;
            })
            .join('')}
          ${Object.keys(CODES)
            .map((k) => `<td class="g-tot">${r.totals[k]}</td>`)
            .join('')}
        </tr>`,
      )
      .join('')}</tbody></table></div>
    <p class="legend">${Object.values(CODES)
      .map((c) => `<span style="--c:${c.color}"><b>${c.short}</b> ${c.label}</span>`)
      .join('')}<span>Il numero accanto a P indica le ore di permesso</span></p>`;
}

async function renderOverview(month) {
  mount('mese', '<div class="loading"></div>');
  const o = await api(`/api/admin/overview/${month}`);
  const expected = o.employees.filter((r) => r.expected);
  const ok = expected.filter((r) => r.state === 'ok').length;
  const late = expected.filter((r) => r.late).length;
  const missing = expected.length - ok;
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const dueTxt = o.deadline === o.today ? 'oggi' : o.deadline < o.today ? 'passata' : '';
  const list = o.employees.length
    ? `<ul class="people">${o.employees
        .map(
          (r) => `<li><a class="person" href="#dipendente/${r.id}/${month}">
            <span class="avatar avatar-sm">${esc(initials(r.name))}</span>
            <span class="person-main"><b>${esc(r.name)}</b><small>${esc(r.job || '')}${r.confirmedAt && r.state === 'ok' ? `${r.job ? ' · ' : ''}il ${esc(stamp(r.confirmedAt, { seconds: false }))}` : ''}</small></span>
            <span class="person-side">${pill(r)}<span class="mini-totals">${Object.entries(CODES)
              .map(([k, c]) => `<span style="--c:${c.color}" title="${c.label}">${c.short} ${r.totals[k]}</span>`)
              .join('')}</span></span>
            ${icon('right', 'chev')}</a></li>`,
        )
        .join('')}</ul>`
    : `<div class="empty">${icon('users')}<p>Non ci sono ancora dipendenti.</p><a class="btn btn-primary" href="#dipendenti">${icon('plus')} Aggiungi i dipendenti</a></div>`;

  $('.main').innerHTML = `
    <div class="month-nav">
      <a class="icon-btn" href="#mese/${prev}" aria-label="${esc(monthLabel(prev))}">${icon('left')}</a>
      <h1 class="month-title">${esc(monthLabel(month))}</h1>
      <a class="icon-btn" href="#mese/${next}" aria-label="${esc(monthLabel(next))}">${icon('right')}</a>
    </div>
    <p class="deadline">Scadenza: <b>${esc(dayLabel(o.deadline))}</b>${dueTxt ? ` (${dueTxt})` : ''}</p>
    <div class="stats">
      <div class="stat stat-ok"><b>${ok}<small>/${expected.length}</small></b><span>confermati</span></div>
      <div class="stat stat-todo"><b>${missing - late}</b><span>da confermare</span></div>
      <div class="stat stat-late"><b>${late}</b><span>in ritardo</span></div>
    </div>
    <div class="actions">
      <button class="btn btn-soft" data-remind ${missing ? '' : 'disabled'}>${icon('bell')} Sollecita chi manca${missing ? ` (${missing})` : ''}</button>
      <button class="btn btn-soft" data-export>${icon('download')} Excel</button>
      ${DEMO ? '' : `<button class="btn btn-soft" data-print>${icon('printer')} Stampa</button>`}
    </div>
    <div class="seg" role="tablist" aria-label="Vista">
      <button role="tab" data-view="list" aria-selected="${overviewView === 'list'}" class="${overviewView === 'list' ? 'on' : ''}">${icon('list')} Elenco</button>
      <button role="tab" data-view="grid" aria-selected="${overviewView === 'grid'}" class="${overviewView === 'grid' ? 'on' : ''}">${icon('grid')} Tabella</button>
    </div>
    <div data-body>${overviewView === 'grid' && o.employees.length ? gridHtml(o) : list}</div>`;

  $$('[data-view]').forEach(
    (b) =>
      (b.onclick = () => {
        overviewView = b.dataset.view;
        try {
          localStorage.setItem('h14-view', overviewView);
        } catch {
          /* private mode */
        }
        renderOverview(month);
      }),
  );
  $('[data-body]').addEventListener('click', (e) => {
    const row = e.target.closest('[data-open]');
    if (row) go(`#dipendente/${row.dataset.open}/${month}`);
  });
  $('[data-export]').onclick = (e) => busy(e.currentTarget, () => download(`/api/admin/export/${month}`, `presenze-${month}.csv`));
  const printBtn = $('[data-print]');
  if (printBtn) printBtn.onclick = () => {
    if (overviewView !== 'grid' && o.employees.length) $('[data-body]').innerHTML = gridHtml(o);
    setTimeout(() => window.print(), 50);
  };
  $('[data-remind]').onclick = async (e) => {
    const names = expected.filter((r) => r.state !== 'ok').map((r) => r.name);
    const yes = await confirmSheet({
      title: 'Mandare un promemoria?',
      body: `<p>Riceveranno una notifica sul telefono e un'email: <b>${names.map(esc).join(', ')}</b>.</p>`,
      ok: 'Invia promemoria',
    });
    if (yes) {
      await busy(e.target.closest('button'), async () => {
        const out = await api(`/api/admin/remind/${month}`, { method: 'POST' });
        toast(out.reminded.length ? `Promemoria inviato a ${out.reminded.length} dipendent${out.reminded.length === 1 ? 'e' : 'i'}` : 'Nessuno da sollecitare');
      });
    }
  };
}

async function renderAdminEmployee(id, month) {
  month = isMonth(month) ? month : monthOf(S.today);
  mount('mese', `<a class="back" href="#mese/${month}">${icon('left')} Tutti i dipendenti</a><div data-head></div><section data-editor class="editor"><div class="loading"></div></section>`);
  const base = `/api/admin/user/${id}/month/${month}`;
  let employee = null;
  await monthEditor($('[data-editor]'), {
    load: async () => {
      const d = await api(base);
      if (!employee) {
        employee = d.employee;
        $('[data-head]').innerHTML = `<div class="emp-head"><span class="avatar">${esc(initials(employee.name))}</span><div><h2>${esc(employee.name)}</h2><p class="muted">${esc([employee.job, employee.email].filter(Boolean).join(' · '))}</p></div></div>`;
      }
      return d;
    },
    save: (days, entry) => api(`${base}/days`, { method: 'PUT', body: { days, entry } }),
    history: () => api(`${base}/history`),
    admin: true,
    get name() {
      return employee?.firstName || '';
    },
    navHash: (m) => `#dipendente/${id}/${m}`,
  });
}

/* ------------------------------------------------------------------ */
/* Owner: employees                                                    */
/* ------------------------------------------------------------------ */

async function renderEmployees() {
  mount('dipendenti', '<div class="loading"></div>');
  const { employees, admins } = await api('/api/admin/employees');
  const row = (u) => `<li><button class="person" data-edit="${u.id}">
      <span class="avatar avatar-sm${u.active ? '' : ' off'}">${esc(initials(u.name))}</span>
      <span class="person-main"><b>${esc(u.name)}</b><small>${esc([u.job, u.email].filter(Boolean).join(' · '))}</small></span>
      <span class="person-side">${!u.active ? '<span class="pill pill-off">Disattivato</span>' : !u.activated ? '<span class="pill pill-warn">Invito in attesa</span>' : '<span class="pill pill-ok">Attivo</span>'}
        ${u.pushDevices ? `<span class="muted small" title="Notifiche attive">${icon('bell')} ${u.pushDevices}</span>` : ''}</span>
      ${icon('right', 'chev')}</button></li>`;
  $('.main').innerHTML = `
    <div class="page-head"><h1>Dipendenti</h1><button class="btn btn-primary" data-add>${icon('plus')} Aggiungi</button></div>
    ${employees.length ? `<ul class="people">${employees.map(row).join('')}</ul>` : `<div class="empty">${icon('users')}<p>Aggiungi i tuoi dipendenti: ognuno riceve un link personale per scegliere la sua password.</p></div>`}
    <h2 class="section-title">Titolari</h2>
    <ul class="people">${admins.map(row).join('')}</ul>
    <p class="muted small">Il titolare vede e corregge le presenze di tutti, gestisce i dipendenti e il registro.</p>`;
  const all = [...employees, ...admins];
  $('[data-add]').onclick = () => editEmployee(null);
  $$('[data-edit]').forEach((b) => (b.onclick = () => editEmployee(all.find((u) => u.id === Number(b.dataset.edit)))));
}

function editEmployee(u) {
  const isNew = !u;
  const self = u && u.id === S.me.id;
  sheet(
    (el, close) => {
      el.innerHTML = `
        <h2 class="sheet-title">${isNew ? 'Nuovo dipendente' : esc(u.name)}</h2>
        <form class="form" novalidate>
          <div class="row2">
            <label class="field"><span>Nome *</span><input name="firstName" value="${esc(u?.firstName)}" required autocomplete="off"></label>
            <label class="field"><span>Cognome</span><input name="lastName" value="${esc(u?.lastName)}" autocomplete="off"></label>
          </div>
          <label class="field"><span>Email * <small>(per entrare e ricevere i promemoria)</small></span><input type="email" name="email" value="${esc(u?.email)}" inputmode="email" required autocomplete="off"></label>
          <div class="row2">
            <label class="field"><span>Telefono</span><input type="tel" name="phone" value="${esc(u?.phone)}" autocomplete="off"></label>
            <label class="field"><span>Mansione</span><input name="job" value="${esc(u?.job)}" placeholder="Es. Reception" autocomplete="off"></label>
          </div>
          ${
            self
              ? ''
              : `<label class="field"><span>Ruolo</span><select name="role">
                  <option value="employee"${u?.role !== 'admin' ? ' selected' : ''}>Dipendente: segna le sue presenze</option>
                  <option value="admin"${u?.role === 'admin' ? ' selected' : ''}>Titolare: gestisce tutto</option></select></label>`
          }
          <div class="sheet-actions"><button type="button" class="btn btn-ghost" data-cancel>Annulla</button><button class="btn btn-primary" type="submit">${isNew ? 'Aggiungi e invia invito' : 'Salva'}</button></div>
        </form>
        ${
          isNew || self
            ? ''
            : `<div class="sheet-extra">
                ${u.active ? `<button class="btn btn-soft btn-block" data-access>${icon('key')} ${u.activated ? 'Reimposta la password (nuovo link)' : 'Reinvia il link di invito'}</button>` : ''}
                <button class="btn btn-ghost btn-block ${u.active ? 'danger-text' : ''}" data-toggle>${u.active ? 'Disattiva account' : 'Riattiva account'}</button>
                <p class="muted small">${u.lastSeen ? `Ultimo accesso: ${esc(stamp(u.lastSeen, { seconds: false }))}` : 'Non ha ancora usato l’app'}. Disattivando l'account i dati restano nel registro.</p>
              </div>`
        }`;
      const form = el.querySelector('form');
      el.querySelector('[data-cancel]').onclick = () => close();
      form.onsubmit = (e) => {
        e.preventDefault();
        const body = Object.fromEntries(new FormData(form));
        busy(form.querySelector('[type=submit]'), async () => {
          if (isNew) {
            const out = await api('/api/admin/employees', { method: 'POST', body });
            close();
            showAccessLink(out.employee, out.access);
          } else {
            await api(`/api/admin/employees/${u.id}`, { method: 'PATCH', body });
            close();
            toast('Dati salvati');
          }
          if (self) await loadMe();
          renderEmployees();
        });
      };
      el.querySelector('[data-access]')?.addEventListener('click', (e) =>
        busy(e.currentTarget, async () => {
          const out = await api(`/api/admin/employees/${u.id}/access`, { method: 'POST' });
          close();
          showAccessLink(u, out);
        }),
      );
      el.querySelector('[data-toggle]')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (u.active && !(await confirmSheet({ title: `Disattivare ${u.name}?`, body: '<p>Non potrà più entrare nell’app. Le sue presenze e il registro restano conservati.</p>', ok: 'Disattiva', danger: true }))) return;
        await busy(btn, async () => {
          await api(`/api/admin/employees/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
          close();
          toast(u.active ? 'Account disattivato' : 'Account riattivato');
          renderEmployees();
        });
      });
    },
    { label: isNew ? 'Nuovo dipendente' : u.name },
  );
}

function showAccessLink(u, access) {
  const first = u.firstName || u.name;
  const text = `Ciao ${first}! Da oggi segni le tue presenze a ${S.company} con l'app. Apri questo link personale e scegli la tua password: ${access.link}`;
  const phone = String(u.phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^(?=3\d{8,9}$)/, '39');
  sheet((el, close) => {
    el.innerHTML = `
      <h2 class="sheet-title">Link di accesso per ${esc(first)}</h2>
      ${
        access.emailed
          ? `<div class="notice notice-ok">${icon('mail')}<p>Email inviata a <b>${esc(u.email)}</b>. Se vuoi, mandagli il link anche su WhatsApp.</p></div>`
          : `<div class="notice notice-warn">${icon('info')}<p>${S.emailEnabled ? 'Email non partita' : 'Le email non sono ancora configurate'}: manda tu il link a ${esc(first)}, per esempio su WhatsApp.</p></div>`
      }
      <div class="linkbox"><code>${esc(access.link)}</code></div>
      <p class="muted small">Il link è personale e vale 14 giorni; creandone uno nuovo il precedente smette di funzionare.</p>
      <div class="sheet-actions">
        <button class="btn btn-soft" data-copy>${icon('copy')} Copia</button>
        <a class="btn btn-primary" target="_blank" rel="noopener" href="https://wa.me/${phone}?text=${encodeURIComponent(text)}">${icon('share')} WhatsApp</a>
      </div>
      <button class="link-btn" data-close>Chiudi</button>`;
    el.querySelector('[data-copy]').onclick = async () => {
      try {
        await navigator.clipboard.writeText(access.link);
        toast('Link copiato');
      } catch {
        toast('Copia non riuscita: tieni premuto sul link', 'error');
      }
    };
    el.querySelector('[data-close]').onclick = () => close();
  });
}

/* ------------------------------------------------------------------ */
/* Owner: audit log                                                    */
/* ------------------------------------------------------------------ */

async function renderAudit() {
  mount('registro', '<div class="loading"></div>');
  const [{ employees }, check] = await Promise.all([api('/api/admin/employees'), api('/api/admin/audit/verify')]);
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const filter = { user: params.get('user') || '', month: params.get('month') || '', kind: params.get('kind') || '' };
  const monthsList = Array.from({ length: 14 }, (_, i) => addMonths(addMonths(monthOf(S.today), 1), -i));

  $('.main').innerHTML = `
    <div class="page-head"><h1>Registro</h1><button class="btn btn-soft" data-csv>${icon('download')} Esporta</button></div>
    <div class="seal ${check.ok ? 'seal-ok' : 'seal-bad'}">
      ${icon(check.ok ? 'shield' : 'alert')}
      <div>
        <b>${check.ok ? 'Registro integro' : 'ATTENZIONE: registro alterato'}</b>
        <span>${
          check.ok
            ? `${check.count.toLocaleString('it-IT')} eventi verificati uno per uno. Ultimo sigillo: n. ${check.head?.id ?? 0}${check.head ? ` · <code>${esc(check.head.hash.slice(0, 16))}…</code>` : ''}`
            : `Problema all'evento n. ${check.brokenAt}: ${esc(check.reason)}.`
        }</span>
      </div>
    </div>
    <details class="explain"><summary>Come funziona la certificazione</summary>
      <p>Ogni azione (giorni segnati, conferme, accessi, promemoria, modifiche ai dipendenti) diventa un evento con data e ora del server, autore, dispositivo e indirizzo IP. Gli eventi non si possono modificare né cancellare, e ognuno contiene l'impronta digitale (SHA-256) del precedente: basta alterarne uno perché la catena si rompa e la verifica qui sopra lo segnali. Alla conferma del mese il dipendente riceve una ricevuta via email con le impronte, e tu ricevi il sigillo del registro nei riepiloghi.</p>
    </details>
    <div class="filters">
      <select data-f="user" aria-label="Dipendente"><option value="">Tutti i dipendenti</option>${employees
        .map((u) => `<option value="${u.id}"${String(u.id) === filter.user ? ' selected' : ''}>${esc(u.name)}</option>`)
        .join('')}</select>
      <select data-f="month" aria-label="Mese"><option value="">Tutti i mesi</option>${monthsList
        .map((m) => `<option value="${m}"${m === filter.month ? ' selected' : ''}>${esc(monthLabel(m))}</option>`)
        .join('')}</select>
      <select data-f="kind" aria-label="Tipo di evento"><option value="">Tutti gli eventi</option><option value="days"${filter.kind === 'days' ? ' selected' : ''}>Solo presenze e conferme</option></select>
    </div>
    <ol class="events" data-events></ol>
    <button class="btn btn-ghost btn-block" data-more hidden>Carica altri</button>`;

  const listEl = $('[data-events]');
  let before = '';
  async function load() {
    const qs = new URLSearchParams({ ...filter, before, limit: '100' });
    for (const [k, v] of [...qs]) if (!v) qs.delete(k);
    const out = await api(`/api/admin/audit?${qs}`);
    if (!before && !out.events.length) listEl.innerHTML = '<li class="muted">Nessun evento con questi filtri.</li>';
    listEl.insertAdjacentHTML('beforeend', out.events.map((e) => eventHtml(e)).join(''));
    before = out.events.at(-1)?.id ?? before;
    $('[data-more]').hidden = !out.more;
  }
  await load();
  $('[data-more]').onclick = (e) => busy(e.currentTarget, load);
  $$('[data-f]').forEach(
    (s) =>
      (s.onchange = () => {
        filter[s.dataset.f] = s.value;
        const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
        history.replaceState(null, '', `#registro${qs.size ? `?${qs}` : ''}`);
        before = '';
        listEl.innerHTML = '';
        load().catch(toastError);
      }),
  );
  $('[data-csv]').onclick = (e) =>
    busy(e.currentTarget, () => download(`/api/admin/audit/export${filter.month ? `?month=${filter.month}` : ''}`, 'registro-presenze.csv'));
}

/* ------------------------------------------------------------------ */
/* Owner: settings                                                     */
/* ------------------------------------------------------------------ */

async function renderSettings() {
  mount('impostazioni', '<div class="loading"></div>');
  const s = await api('/api/admin/settings');
  const e = s.email;
  const hours = Array.from({ length: 15 }, (_, i) => i + 6);
  $('.main').innerHTML = `
    <div class="page-head"><h1>Impostazioni</h1></div>
    <form class="card form" data-general novalidate>
      <h2 class="card-title">Generali</h2>
      <div class="row2">
        <label class="field"><span>Il tuo nome</span><input name="firstName" value="${esc(s.me.firstName)}"></label>
        <label class="field"><span>Cognome</span><input name="lastName" value="${esc(s.me.lastName)}"></label>
      </div>
      <label class="field"><span>Nome dell'azienda</span><input name="companyName" value="${esc(s.companyName)}"></label>
      <label class="field"><span>Ora dei promemoria automatici</span><select name="reminderHour">${hours
        .map((h) => `<option value="${h}"${h === s.reminderHour ? ' selected' : ''}>alle ${String(h).padStart(2, '0')}:00</option>`)
        .join('')}</select></label>
      <p class="muted small">Scadenza: l'ultimo giovedì di ogni mese. Chi non ha confermato riceve una notifica e un'email 3 giorni prima, il giorno stesso e ogni giorno per una settimana dopo. Il giorno dopo la scadenza ti arriva il riepilogo di chi manca.</p>
      <button class="btn btn-primary" type="submit">Salva</button>
    </form>

    <form class="card form" data-email novalidate>
      <h2 class="card-title">Email ${s.emailEnabled ? '<span class="pill pill-ok">Attive</span>' : '<span class="pill pill-warn">Da configurare</span>'}</h2>
      ${
        s.emailFromEnv
          ? '<p class="muted">Configurate dal server (variabili SMTP).</p>'
          : `<p class="muted small">Servono per inviti, promemoria e ricevute. Con Gmail: attiva la verifica in due passaggi, apri <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">myaccount.google.com/apppasswords</a>, crea una password per le app chiamata «Presenze» e incollala qui.</p>
          <label class="field"><span>Servizio</span><select name="provider">
            <option value="gmail"${e.provider === 'gmail' ? ' selected' : ''}>Gmail / Google Workspace</option>
            <option value="brevo"${e.provider === 'brevo' ? ' selected' : ''}>Brevo</option>
            <option value="custom"${e.provider === 'custom' ? ' selected' : ''}>Altro (SMTP)</option></select></label>
          <div class="row2" data-custom ${e.provider === 'custom' ? '' : 'hidden'}>
            <label class="field"><span>Server SMTP</span><input name="host" value="${esc(e.host)}" placeholder="smtp.esempio.it"></label>
            <label class="field"><span>Porta</span><input name="port" inputmode="numeric" value="${esc(e.port)}"></label>
          </div>
          <label class="field"><span>Indirizzo email</span><input type="email" name="user" value="${esc(e.user)}" autocomplete="off"></label>
          <label class="field"><span>Password per le app ${e.hasPass ? '<small>(salvata: lascia vuoto per non cambiarla)</small>' : ''}</span><input type="password" name="pass" autocomplete="new-password"></label>
          <label class="field"><span>Nome del mittente</span><input name="fromName" value="${esc(e.fromName)}" placeholder="Presenze ${esc(s.companyName)}"></label>
          <div class="btn-row"><button class="btn btn-primary" type="submit">Salva</button><button class="btn btn-soft" type="button" data-test ${s.emailEnabled ? '' : 'disabled'}>Invia email di prova</button></div>`
      }
    </form>

    <div class="card">
      <h2 class="card-title">Notifiche su questo dispositivo</h2>
      <p class="muted small">Ricevi il riepilogo dopo ogni scadenza e un avviso quando qualcuno corregge un mese già confermato.</p>
      <div data-push-admin></div>
    </div>

    <div class="card">
      <h2 class="card-title">Account</h2>
      <p class="muted small">Entri come <b>${esc(s.me.email)}</b>.</p>
      <div class="btn-row"><button class="btn btn-soft" data-pass>${icon('key')} Cambia password</button><button class="btn btn-ghost" data-logout>${icon('logout')} Esci</button></div>
    </div>`;

  const general = $('[data-general]');
  general.onsubmit = (ev) => {
    ev.preventDefault();
    busy(general.querySelector('[type=submit]'), async () => {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: {
          companyName: general.companyName.value,
          reminderHour: Number(general.reminderHour.value),
          me: { firstName: general.firstName.value, lastName: general.lastName.value },
        },
      });
      await loadMe();
      toast('Impostazioni salvate');
      renderSettings();
    });
  };
  const email = $('[data-email]');
  if (email.provider) {
    email.provider.onchange = () => ($('[data-custom]').hidden = email.provider.value !== 'custom');
    email.onsubmit = (ev) => {
      ev.preventDefault();
      busy(email.querySelector('[type=submit]'), async () => {
        const f = Object.fromEntries(new FormData(email));
        await api('/api/admin/settings', { method: 'PUT', body: { email: { ...f, fromEmail: f.user } } });
        await loadMe();
        toast('Email salvate: ora invia una prova');
        renderSettings();
      });
    };
    email.querySelector('[data-test]').onclick = (ev) =>
      busy(ev.currentTarget, async () => {
        const out = await api('/api/admin/test-email', { method: 'POST' });
        toast(`Email di prova inviata a ${out.to}`);
      });
  }
  pushCard($('[data-push-admin]'), { inline: true });
  $('[data-pass]').onclick = changePassword;
  $('[data-logout]').onclick = logout;
}

/* ------------------------------------------------------------------ */
/* Profile, password, logout                                           */
/* ------------------------------------------------------------------ */

function openProfile() {
  sheet((el, close) => {
    el.innerHTML = `
      <div class="profile"><span class="avatar">${esc(initials(`${S.me.firstName} ${S.me.lastName}`))}</span>
        <div><b>${esc(`${S.me.firstName} ${S.me.lastName}`.trim())}</b><span class="muted">${esc(S.me.email)}</span></div></div>
      <div data-push-profile></div>
      <div class="sheet-list">
        <button class="btn btn-soft btn-block" data-pass>${icon('key')} Cambia password</button>
        <button class="btn btn-ghost btn-block" data-logout>${icon('logout')} Esci</button>
      </div>`;
    pushCard(el.querySelector('[data-push-profile]'), { inline: true });
    el.querySelector('[data-pass]').onclick = () => (close(), changePassword());
    el.querySelector('[data-logout]').onclick = () => (close(), logout());
  });
}

function changePassword() {
  sheet((el, close) => {
    el.innerHTML = `
      <h2 class="sheet-title">Cambia password</h2>
      <form class="form" novalidate>
        <input type="email" name="username" value="${esc(S.me.email)}" autocomplete="username" hidden>
        <label class="field"><span>Password attuale</span><input type="password" name="current" autocomplete="current-password" required></label>
        <label class="field"><span>Nuova password (almeno ${MIN_PASSWORD} caratteri)</span><input type="password" name="password" autocomplete="new-password" required></label>
        <div class="sheet-actions"><button type="button" class="btn btn-ghost" data-cancel>Annulla</button><button class="btn btn-primary" type="submit">Salva</button></div>
      </form>`;
    const form = el.querySelector('form');
    el.querySelector('[data-cancel]').onclick = () => close();
    form.onsubmit = (e) => {
      e.preventDefault();
      busy(form.querySelector('[type=submit]'), async () => {
        await api('/api/password', { method: 'POST', body: { current: form.current.value, password: form.password.value } });
        close();
        toast('Password cambiata. Gli altri dispositivi sono stati disconnessi.');
      });
    };
  });
}

async function logout() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  S.me = null;
  go('#');
}

/* ------------------------------------------------------------------ */
/* Push notifications                                                  */
/* ------------------------------------------------------------------ */

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function registerServiceWorker() {
  if (DEMO || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'navigate') location.href = e.data.url;
  });
  syncPushSubscription();
}

async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Re-send the existing subscription (keys can rotate, or the user can change). */
async function syncPushSubscription() {
  if (!S.me || !pushSupported() || Notification.permission !== 'granted') return;
  try {
    const sub = await currentSubscription();
    if (sub) await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  } catch {
    /* offline: retry next time */
  }
}

function urlB64ToUint8Array(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function enablePush() {
  if (DEMO) return DEMO.enablePush();
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifiche non consentite: puoi attivarle dalle impostazioni del telefono');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(S.vapid) });
  await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  await api('/api/push/test', { method: 'POST' });
}

async function pushStatus() {
  if (DEMO) return DEMO.pushStatus();
  if (!pushSupported()) return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted' && (await currentSubscription().catch(() => null))) return 'on';
  return 'off';
}

async function pushCard(el, { inline = false } = {}) {
  if (!el) return;
  const status = await pushStatus();
  let dismissed = false;
  try {
    dismissed = !inline && localStorage.getItem('h14-push-hide') === '1';
  } catch {
    /* private mode */
  }
  if (!inline && (status === 'on' || status === 'unsupported' || dismissed)) return (el.innerHTML = '');
  const body = {
    on: `<p class="push-on">${icon('check')} Notifiche attive su questo dispositivo</p>`,
    off: `<p>Ti avvisiamo quando si avvicina la scadenza delle presenze.</p><button class="btn btn-primary" data-enable>${icon('bell')} Attiva le notifiche</button>`,
    denied: '<p>Le notifiche sono bloccate: riattivale nelle impostazioni del browser o del telefono per questa app.</p>',
    'ios-install': `<p>Per ricevere i promemoria su iPhone aggiungi l'app alla schermata Home:</p>
      <ol class="steps"><li>Apri questa pagina con <b>Safari</b></li><li>Tocca ${iosShareIcon} <b>Condividi</b></li><li>Scegli <b>Aggiungi alla schermata Home</b></li><li>Apri l'app dalla Home e attiva le notifiche</li></ol>`,
    unsupported: '<p>Questo browser non supporta le notifiche: riceverai i promemoria via email.</p>',
  }[status];
  el.innerHTML = inline
    ? `<div class="push-inline">${body}</div>`
    : `<div class="card push-card">${!inline ? `<button class="icon-btn push-x" data-hide aria-label="Nascondi">${icon('x')}</button>` : ''}<h2 class="card-title">${icon('bell')} Promemoria sul telefono</h2>${body}</div>`;
  el.querySelector('[data-enable]')?.addEventListener('click', (e) =>
    busy(e.currentTarget, async () => {
      await enablePush();
      toast('Notifiche attivate');
      pushCard(el, { inline });
    }),
  );
  el.querySelector('[data-hide]')?.addEventListener('click', () => {
    try {
      localStorage.setItem('h14-push-hide', '1');
    } catch {
      /* private mode */
    }
    el.innerHTML = '';
  });
}

async function offerPush() {
  const status = await pushStatus();
  if (status !== 'off' && status !== 'ios-install') return;
  sheet((el, close) => {
    el.innerHTML = `<h2 class="sheet-title">${icon('bell')} Non perdere la scadenza</h2><div data-p></div><button class="link-btn" data-later>Più tardi</button>`;
    pushCard(el.querySelector('[data-p]'), { inline: true });
    el.querySelector('[data-later]').onclick = () => close();
  });
}

boot();
