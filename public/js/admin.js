// "Regia": the couple's control panel. Loaded only for admins.
import {
  $,
  $$,
  esc,
  richText,
  api,
  uploadForm,
  icon,
  fmtDateTime,
  countdown,
  localInputToIso,
  isoToLocalInput,
  resizeImage,
  toast,
  errorToast,
  sheet,
  confirmDialog,
  copyText,
  ACCENTS,
} from './util.js';

let ctx; // helpers from app.js (state, router, shared views)

export async function renderAdmin(main, args, context) {
  ctx = context;
  const pages = { '': adminHome, ospiti: adminGuests, contenuti: adminContent, email: adminEmail, condividi: adminShare };
  await (pages[args[0] || ''] || adminHome)(main, args.slice(1));
}

const tz = () => ctx.S.settings.tz || 'Europe/Rome';
const back = `<a class="back" href="#admin">${icon('left')} Regia</a>`;

async function overview() {
  return api('/api/admin/overview');
}

function checkRow(done, label, href) {
  return `<a class="check-row ${done ? 'done' : ''}" href="${href}"><span class="check-dot">${done ? icon('check') : ''}</span><span>${label}</span>${icon('right')}</a>`;
}

/* ================================================================== */
/* Home                                                                */
/* ================================================================== */

async function adminHome(main) {
  main.innerHTML = `<div class="container admin"><div class="card skeleton" style="height:300px"></div></div>`;
  let O = await overview();

  const render = () => {
    const s = O.settings;
    const st = O.stats;
    const live = s.mode === 'live';
    const revealFuture = s.revealAt && !O.revealed;
    const checklist = [
      checkRow(s.coupleNames !== 'Giulia & Marco' && !!s.weddingDate, 'Personalizza nomi, data e informazioni', '#admin/contenuti'),
      checkRow(O.emailEnabled, "Configura l'invio delle email", '#admin/email'),
      checkRow(st.tables > 0 && st.withTable > 0, 'Inserisci tavoli e invitati', '#admin/ospiti'),
      checkRow(!!s.revealAt, 'Scegli quando svelare i tavoli', '#admin'),
      checkRow(st.registered > 1, 'Condividi il link con gli invitati', '#admin/condividi'),
    ];
    const allDone = !checklist.some((c) => !c.includes('check-row done'));

    main.innerHTML = `
    <div class="container admin">
      <div class="admin-head">
        <h2 class="script">Regia</h2>
        <p class="muted">Tutto quello che serve agli sposi, in un posto solo.</p>
      </div>

      ${allDone ? '' : `<section class="card"><h3 class="card-title small-title">✨ Per iniziare</h3><div class="checklist">${checklist.join('')}</div></section>`}

      <section class="card">
        <h3 class="card-title">Modalità dell'app</h3>
        <div class="segmented" role="group">
          <button data-mode="info" class="${live ? '' : 'on'}">${icon('info')} Informazioni</button>
          <button data-mode="live" class="${live ? 'on' : ''}"><span class="live-dot"></span> Bacheca live</button>
        </div>
        <p class="small muted">${
          live
            ? 'Gli invitati vedono la <b>bacheca</b> con chat e foto in diretta. Le informazioni restano disponibili nella scheda «Info».'
            : 'Gli invitati vedono le <b>informazioni</b> sul matrimonio. Quando vuoi, attiva la bacheca live con un tocco.'
        }</p>
        <label class="switch-row"><input type="checkbox" id="notifyOnLive" ${s.notifyOnLive ? 'checked' : ''}/> <span>Avvisa tutti con una notifica quando apro la bacheca</span></label>
        ${
          live
            ? ''
            : s.autoLiveAt
              ? `<div class="note">${icon('clock')} La bacheca si aprirà da sola <b>${esc(fmtDateTime(s.autoLiveAt, tz()))}</b> <button class="link" id="auto-cancel">Annulla</button></div>`
              : `<details class="more"><summary>Apri la bacheca automaticamente a un orario</summary>
                  <div class="inline-form"><input type="datetime-local" id="autoLiveAt" /><button class="btn small primary" id="auto-save">Programma</button></div>
                </details>`
        }
        <div class="toggles">
          <label class="switch-row"><input type="checkbox" id="allowPhotos" ${s.allowPhotos ? 'checked' : ''}/> <span>Gli invitati possono pubblicare foto</span></label>
          <label class="switch-row"><input type="checkbox" id="allowChat" ${s.allowChat ? 'checked' : ''}/> <span>Gli invitati possono scrivere in chat</span></label>
        </div>
      </section>

      <section class="stats">
        <div class="stat"><b>${st.registered}</b><span>registrati</span></div>
        <div class="stat"><b>${st.withPush}</b><span>con notifiche</span></div>
        <div class="stat"><b>${st.online}</b><span>online ora</span></div>
        <div class="stat"><b>${st.photos}</b><span>foto</span></div>
        <div class="stat"><b>${st.messages}</b><span>messaggi</span></div>
        <div class="stat"><b>${st.tables}</b><span>tavoli</span></div>
      </section>

      <section class="card" id="reveal">
        <h3 class="card-title">🎁 Svelamento dei tavoli</h3>
        ${
          O.revealed
            ? `<div class="note ok">${icon('check')} Tavoli svelati ${esc(fmtDateTime(s.revealAt, tz()))}</div>
               <div class="progress-list">
                 <div><b>${st.notified}</b> / ${st.toNotify} invitati avvisati</div>
                 <div><b>${st.emailSent}</b> email inviate${st.emailPending ? ` · <b>${st.emailPending}</b> in coda` : ''}${st.emailErrors ? ` · <span class="danger-text"><b>${st.emailErrors}</b> non riuscite</span>` : ''}</div>
               </div>`
            : revealFuture
              ? `<div class="note">${icon('clock')} Programmato per <b>${esc(fmtDateTime(s.revealAt, tz()))}</b></div>
                 <div class="countdown small" id="reveal-cd"></div>`
              : `<p class="muted">Scegli giorno e ora: in quel momento ogni invitato registrato riceverà una notifica e un'email con il suo tavolo, i compagni di tavolo e la piantina. Riceve l'email anche chi non si è registrato, se nella lista hai inserito il suo indirizzo.</p>`
        }
        ${st.registeredNoTable ? `<div class="note warn">⚠️ ${st.registeredNoTable} registrati non hanno ancora un tavolo. <a href="#admin/ospiti/senza-tavolo">Assegnali</a></div>` : ''}
        ${O.emailEnabled ? '' : `<div class="note warn">✉️ Email non configurate: gli invitati riceveranno solo la notifica. <a href="#admin/email">Configura</a></div>`}
        ${
          O.revealed
            ? `<div class="btn-row">
                ${st.emailErrors ? `<button class="btn small primary" id="retry-failed">${icon('refresh')} Riprova email non riuscite</button>` : ''}
                <button class="btn small ghost" id="reveal-hide">Nascondi di nuovo i tavoli</button>
              </div>`
            : `<div class="form">
                <label class="field"><span>Data e ora dello svelamento</span><input type="datetime-local" id="revealAt" value="${isoToLocalInput(s.revealAt, tz())}"/></label>
                <label class="field"><span>Messaggio nell'email (facoltativo)</span><textarea id="revealMessage" rows="2" placeholder="Es. È arrivato il momento: ecco dove siederai!">${esc(s.revealMessage)}</textarea></label>
                <div class="btn-row">
                  <button class="btn primary" id="reveal-save">${icon('clock')} Programma</button>
                  <button class="btn ghost" id="reveal-preview">${icon('mail')} Anteprima email</button>
                  <button class="btn ghost" id="reveal-now">Svela adesso</button>
                </div>
              </div>`
        }
      </section>

      <section class="card">
        <h3 class="card-title">📣 Annuncio a tutti</h3>
        <form class="form" id="announce">
          <label class="field"><span>Titolo</span><input name="title" maxlength="120" placeholder="Es. Tra 10 minuti il taglio della torta!" /></label>
          <label class="field"><span>Messaggio</span><textarea name="text" rows="3" maxlength="2000" required placeholder="Es. Vi aspettiamo tutti in giardino 🎂"></textarea></label>
          <label class="switch-row"><input type="checkbox" name="push" checked/> <span>Notifica sul telefono</span></label>
          <label class="switch-row"><input type="checkbox" name="post" checked/> <span>Pubblica in bacheca</span></label>
          <label class="switch-row"><input type="checkbox" name="email"/> <span>Invia anche per email</span></label>
          <button class="btn primary">${icon('send')} Invia annuncio</button>
        </form>
      </section>

      <section class="card menu">
        <a href="#admin/ospiti">${icon('users')}<span>Tavoli e invitati</span>${icon('right')}</a>
        <a href="#admin/contenuti">${icon('edit')}<span>Contenuti e aspetto</span>${icon('right')}</a>
        <a href="#admin/email">${icon('mail')}<span>Email</span>${icon('right')}</a>
        <a href="#admin/condividi">${icon('qr')}<span>Condividi link e QR code</span>${icon('right')}</a>
        <a href="#schermo">${icon('tv')}<span>Schermo per proiettore</span>${icon('right')}</a>
        <a href="/api/admin/photos.zip">${icon('download')}<span>Scarica tutte le foto (.zip)</span>${icon('right')}</a>
        <a href="/api/admin/guests.csv">${icon('download')}<span>Esporta invitati (Excel)</span>${icon('right')}</a>
        <button id="admin-logout">${icon('logout')}<span>Esci dalla regia</span>${icon('right')}</button>
      </section>
    </div>`;

    const cd = $('#reveal-cd', main);
    if (cd) {
      const tick = () => {
        const c = countdown(s.revealAt);
        cd.innerHTML = `<div class="cd-box"><b>${c.d}</b><span>giorni</span></div><div class="cd-box"><b>${c.h}</b><span>ore</span></div><div class="cd-box"><b>${c.m}</b><span>min</span></div><div class="cd-box"><b>${c.s}</b><span>sec</span></div>`;
        if (c.done) reload();
      };
      tick();
      const t = setInterval(tick, 1000);
      cleanupTimers.push(() => clearInterval(t));
    }
  };

  let cleanupTimers = [];
  const reload = async () => {
    cleanupTimers.forEach((f) => f());
    cleanupTimers = [];
    O = await overview();
    render();
  };
  ctx.onCleanup(() => cleanupTimers.forEach((f) => f()));

  const patch = async (body, msg = 'Salvato') => {
    const r = await api('/api/admin/settings', { method: 'PATCH', body });
    O.settings = r.settings;
    toast(msg);
    await reload();
  };

  main.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t || !main.contains(t)) return;
    try {
      if (t.dataset.mode) {
        const mode = t.dataset.mode;
        if (mode === O.settings.mode) return;
        const ok = await confirmDialog(
          mode === 'live'
            ? `Aprire la bacheca live a tutti gli invitati?${O.settings.notifyOnLive ? '\nRiceveranno una notifica.' : ''}`
            : 'Tornare alla modalità informazioni? La bacheca verrà nascosta agli invitati (foto e messaggi restano salvati).',
          { ok: mode === 'live' ? 'Apri la bacheca' : 'Torna alle info' },
        );
        if (!ok) return;
        await api('/api/admin/mode', { method: 'POST', body: { mode, notify: O.settings.notifyOnLive } });
        await ctx.refreshState();
        toast(mode === 'live' ? 'Bacheca live aperta! 🎉' : 'Modalità informazioni');
        await reload();
      } else if (t.id === 'auto-save') {
        const v = $('#autoLiveAt', main).value;
        if (!v) return toast('Scegli data e ora', 'error');
        await patch({ autoLiveAt: localInputToIso(v, tz()) }, 'Apertura programmata');
      } else if (t.id === 'auto-cancel') {
        await patch({ autoLiveAt: null }, 'Programmazione annullata');
      } else if (t.id === 'reveal-save') {
        const v = $('#revealAt', main).value;
        if (!v) return toast('Scegli data e ora', 'error');
        const iso = localInputToIso(v, tz());
        if (Date.parse(iso) <= Date.now()) return toast("L'orario è già passato: usa «Svela adesso»", 'error');
        await patch({ revealAt: iso, revealMessage: $('#revealMessage', main).value }, 'Svelamento programmato 🎁');
      } else if (t.id === 'reveal-preview') {
        await api('/api/admin/settings', { method: 'PATCH', body: { revealMessage: $('#revealMessage', main).value } });
        await previewEmail();
      } else if (t.id === 'reveal-now') {
        const ok = await confirmDialog(
          `Svelare adesso i tavoli?\n${O.stats.toNotify} invitati con un tavolo riceveranno subito notifica e/o email.`,
          { ok: 'Svela adesso' },
        );
        if (!ok) return;
        await api('/api/admin/settings', { method: 'PATCH', body: { revealMessage: $('#revealMessage', main).value } });
        await api('/api/admin/reveal/now', { method: 'POST' });
        toast('Tavoli svelati! 🎉');
        setTimeout(reload, 1500);
      } else if (t.id === 'retry-failed') {
        await api('/api/admin/reveal/reset', { method: 'POST', body: { scope: 'failed' } });
        toast('Nuovo tentativo in corso');
        setTimeout(reload, 2000);
      } else if (t.id === 'reveal-hide') {
        const ok = await confirmDialog(
          'Nascondere di nuovo i tavoli? Chi ha già ricevuto la notifica non la riceverà di nuovo, a meno che non cambi il suo tavolo.',
          { ok: 'Nascondi' },
        );
        if (ok) await patch({ revealAt: null }, 'Tavoli nascosti');
      } else if (t.id === 'admin-logout') {
        await api('/api/admin/logout', { method: 'POST' });
        location.hash = '';
        location.reload();
      }
    } catch (err) {
      errorToast(err);
    }
  });

  main.addEventListener('change', async (e) => {
    const id = e.target.id;
    if (!['notifyOnLive', 'allowPhotos', 'allowChat'].includes(id)) return;
    try {
      await patch({ [id]: e.target.checked });
    } catch (err) {
      errorToast(err);
    }
  });

  main.addEventListener('submit', async (e) => {
    if (e.target.id !== 'announce') return;
    e.preventDefault();
    const f = e.target;
    const body = {
      title: f.title.value.trim(),
      text: f.text.value.trim(),
      push: f.push.checked,
      post: f.post.checked,
      email: f.email.checked,
    };
    if (!body.text) return toast('Scrivi il messaggio', 'error');
    if (!(await confirmDialog(`Inviare l'annuncio a tutti gli invitati?`, { ok: 'Invia' }))) return;
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api('/api/admin/announce', { method: 'POST', body });
      toast(`Annuncio inviato${body.push ? ` · ${r.pushed} notifiche` : ''}${body.email ? ` · ${r.emails} email in invio` : ''}`);
      f.reset();
    } catch (err) {
      errorToast(err);
    } finally {
      btn.disabled = false;
    }
  });

  ctx.on('guests', () => reload().catch(() => {}));
  const poll = setInterval(() => O.revealed && reload().catch(() => {}), 15000);
  ctx.onCleanup(() => clearInterval(poll));
  render();
}

async function previewEmail() {
  const O = await overview();
  const { el, close } = sheet(`
    <h3 class="sheet-title">Anteprima email</h3>
    <p class="sheet-text">Ti inviamo un esempio dell'email che riceveranno gli invitati.</p>
    <form class="form"><label class="field"><span>La tua email</span><input name="to" type="email" required value="${esc(O.settings.adminEmail)}"/></label>
    <button class="btn primary block">Invia anteprima</button></form>`);
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const to = e.target.to.value.trim();
      await api('/api/admin/settings', { method: 'PATCH', body: { adminEmail: to } });
      await api('/api/admin/reveal/preview', { method: 'POST', body: { to } });
      close();
      toast('Anteprima inviata! Controlla la posta 📬');
    } catch (err) {
      errorToast(err);
    }
  });
}

/* ================================================================== */
/* Guests & tables                                                     */
/* ================================================================== */

async function adminGuests(main, args) {
  const tab = ['tavoli', 'piantina', 'importa'].includes(args[0]) ? args[0] : 'invitati';
  const initialFilter = args[0] === 'senza-tavolo' ? 'notable' : 'all';
  let guests = [];
  let tables = [];

  const load = async () => {
    const [g, t] = await Promise.all([api('/api/admin/guests'), api('/api/admin/tables')]);
    guests = g.guests;
    tables = t.tables;
  };
  main.innerHTML = `<div class="container admin"><div class="card skeleton" style="height:300px"></div></div>`;
  await load();

  main.innerHTML = `
    <div class="container admin">
      ${back}
      <h2 class="page-title">Tavoli e invitati</h2>
      <div class="tabs">
        <a href="#admin/ospiti" class="${tab === 'invitati' ? 'on' : ''}">Invitati</a>
        <a href="#admin/ospiti/tavoli" class="${tab === 'tavoli' ? 'on' : ''}">Tavoli</a>
        <a href="#admin/ospiti/piantina" class="${tab === 'piantina' ? 'on' : ''}">Piantina</a>
        <a href="#admin/ospiti/importa" class="${tab === 'importa' ? 'on' : ''}">Importa</a>
      </div>
      <div id="pane"></div>
    </div>`;
  let pane = $('#pane', main);
  // Each pane render starts from a clean element (drops listeners of the previous render).
  const resetPane = () => {
    const fresh = pane.cloneNode(false);
    pane.replaceWith(fresh);
    pane = fresh;
  };

  /* ---------- Guests ---------- */

  function guestBadges(g) {
    const b = [];
    b.push(g.registered ? '<span class="tag ok">registrato</span>' : '<span class="tag">non registrato</span>');
    if (g.pushDevices) b.push(`<span class="tag ok">${icon('bell')} notifiche</span>`);
    if (g.emailStatus === 'sent') b.push(`<span class="tag ok">${icon('mail')} email inviata</span>`);
    else if (g.emailStatus && g.emailStatus !== 'no-email') b.push(`<span class="tag err" title="${esc(g.emailStatus)}">${icon('mail')} email non riuscita</span>`);
    else if (g.notifiedAt) b.push(`<span class="tag ok">avvisato</span>`);
    return b.join('');
  }
  const tableOptions = (sel) =>
    `<option value="">— nessun tavolo —</option>${tables
      .map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`)
      .join('')}`;

  function guestsPane() {
    resetPane();
    pane.innerHTML = `
      <div class="toolbar">
        <input type="search" id="q" placeholder="Cerca per nome o email…" />
        <select id="filter">
          <option value="all">Tutti (${guests.length})</option>
          <option value="reg">Registrati (${guests.filter((g) => g.registered).length})</option>
          <option value="unreg">Non registrati (${guests.filter((g) => !g.registered).length})</option>
          <option value="notable">Senza tavolo (${guests.filter((g) => !g.tableId).length})</option>
          <option value="err">Email non riuscite</option>
        </select>
      </div>
      <button class="btn primary small" id="add-guest">${icon('plus')} Aggiungi invitato</button>
      ${tables.length ? '' : `<div class="note">Non hai ancora creato tavoli. <a href="#admin/ospiti/tavoli">Creali</a> oppure <a href="#admin/ospiti/importa">importa la lista da Excel</a>.</div>`}
      <div class="guest-list" id="glist"></div>`;
    $('#filter', pane).value = initialFilter;
    const renderList = () => {
      const qv = $('#q', pane).value.trim().toLowerCase();
      const f = $('#filter', pane).value;
      const list = guests.filter((g) => {
        if (qv && !`${g.name} ${g.email || ''}`.toLowerCase().includes(qv)) return false;
        if (f === 'reg') return g.registered;
        if (f === 'unreg') return !g.registered;
        if (f === 'notable') return !g.tableId;
        if (f === 'err') return g.emailStatus && !['sent', 'no-email'].includes(g.emailStatus);
        return true;
      });
      $('#glist', pane).innerHTML = list.length
        ? list
            .map(
              (g) => `
          <div class="guest-row" data-id="${g.id}">
            <div class="g-main">
              <div class="g-name">${esc(g.name)}</div>
              <div class="g-sub">${esc(g.email || 'nessuna email')}${g.seat ? ` · posto ${esc(g.seat)}` : ''}</div>
              <div class="g-tags">${guestBadges(g)}</div>
            </div>
            <div class="g-actions">
              <select class="g-table" aria-label="Tavolo">${tableOptions(g.tableId)}</select>
              <button class="icon-btn" data-edit="${g.id}" aria-label="Modifica">${icon('dots')}</button>
            </div>
          </div>`,
            )
            .join('')
        : `<p class="muted center">Nessun invitato trovato.</p>`;
    };
    renderList();
    $('#q', pane).addEventListener('input', renderList);
    $('#filter', pane).addEventListener('change', renderList);
    $('#add-guest', pane).addEventListener('click', () => guestSheet(null));
    pane.addEventListener('change', async (e) => {
      if (!e.target.matches('.g-table')) return;
      const id = Number(e.target.closest('[data-id]').dataset.id);
      try {
        const r = await api(`/api/admin/guests/${id}`, { method: 'PATCH', body: { tableId: Number(e.target.value) || null } });
        guests = guests.map((g) => (g.id === id ? r.guest : g));
        toast(r.guest.tableName ? `${r.guest.name} → ${r.guest.tableName}` : 'Tavolo rimosso');
        const row = e.target.closest('.guest-row');
        row.querySelector('.g-tags').innerHTML = guestBadges(r.guest);
      } catch (err) {
        errorToast(err);
      }
    });
    pane.addEventListener('click', (e) => {
      const id = e.target.closest('[data-edit]')?.dataset.edit;
      if (id) guestSheet(guests.find((g) => g.id === Number(id)));
    });

    function guestSheet(g) {
      const { el, close } = sheet(`
        <h3 class="sheet-title">${g ? esc(g.name) : 'Nuovo invitato'}</h3>
        ${g ? `<div class="g-tags">${guestBadges(g)}</div>` : ''}
        ${g?.emailStatus && !['sent', 'no-email'].includes(g.emailStatus) ? `<p class="small danger-text">${esc(g.emailStatus)}</p>` : ''}
        <form class="form">
          <label class="field"><span>Nome e cognome</span><input name="name" required value="${esc(g?.name || '')}"/></label>
          <label class="field"><span>Email</span><input name="email" type="email" value="${esc(g?.email || '')}"/></label>
          <div class="field-row">
            <label class="field"><span>Tavolo</span><select name="tableId">${tableOptions(g?.tableId)}</select></label>
            <label class="field narrow"><span>Posto</span><input name="seat" maxlength="20" value="${esc(g?.seat || '')}"/></label>
          </div>
          <button class="btn primary block">Salva</button>
        </form>
        ${
          g
            ? `<div class="btn-row">
                ${g.registered && g.tableId ? `<button class="btn ghost small" data-resend>${icon('refresh')} Reinvia notifica tavolo</button>` : ''}
                <button class="btn ghost small danger-text" data-delete>${icon('trash')} Elimina</button>
              </div>`
            : ''
        }`);
      el.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const body = { name: f.name.value, email: f.email.value, tableId: Number(f.tableId.value) || null, seat: f.seat.value };
        try {
          if (g) await api(`/api/admin/guests/${g.id}`, { method: 'PATCH', body });
          else await api('/api/admin/guests', { method: 'POST', body });
          close();
          toast('Salvato');
          await load();
          guestsPane();
        } catch (err) {
          errorToast(err);
        }
      });
      el.querySelector('[data-resend]')?.addEventListener('click', async () => {
        try {
          await api(`/api/admin/guests/${g.id}/resend`, { method: 'POST' });
          toast(ctx.S.revealed ? 'Notifica in invio' : 'Verrà avvisato al momento dello svelamento');
          close();
        } catch (err) {
          errorToast(err);
        }
      });
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        if (!(await confirmDialog(`Eliminare ${g.name}?`, { ok: 'Elimina', danger: true }))) return;
        try {
          await api(`/api/admin/guests/${g.id}`, { method: 'DELETE' });
          close();
          await load();
          guestsPane();
        } catch (err) {
          errorToast(err);
        }
      });
    }
  }

  /* ---------- Tables ---------- */

  function tablesPane() {
    resetPane();
    pane.innerHTML = `
      <form class="card form" id="add-table">
        <h3 class="card-title small-title">Nuovo tavolo</h3>
        <label class="field"><span>Nome</span><input name="name" required placeholder="Es. Tavolo Positano, Tavolo 1…" /></label>
        <label class="field"><span>Descrizione (facoltativa)</span><input name="description" placeholder="Es. Vicino alla vetrata, lato giardino" /></label>
        <button class="btn primary">${icon('plus')} Aggiungi tavolo</button>
      </form>
      <div class="table-list">${
        tables.length
          ? tables
              .map(
                (t, i) => `
        <div class="table-row card" data-id="${t.id}">
          <div class="t-main">
            <div class="t-name">${esc(t.name)} <span class="muted small">· ${t.guests.length} ${t.guests.length === 1 ? 'persona' : 'persone'}</span></div>
            ${t.description ? `<div class="small">${esc(t.description)}</div>` : ''}
            <div class="small muted">${t.guests.map((g) => esc(g.name)).join(', ') || 'Nessun invitato assegnato'}</div>
          </div>
          <div class="t-actions">
            <button class="icon-btn" data-up ${i === 0 ? 'disabled' : ''} aria-label="Su">${icon('up')}</button>
            <button class="icon-btn" data-down ${i === tables.length - 1 ? 'disabled' : ''} aria-label="Giù">${icon('down')}</button>
            <button class="icon-btn" data-edit aria-label="Modifica">${icon('edit')}</button>
            <button class="icon-btn" data-del aria-label="Elimina">${icon('trash')}</button>
          </div>
        </div>`,
              )
              .join('')
          : '<p class="muted center">Ancora nessun tavolo.</p>'
      }</div>`;
    $('#add-table', pane).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api('/api/admin/tables', {
          method: 'POST',
          body: { name: e.target.name.value, description: e.target.description.value },
        });
        tables = r.tables;
        toast('Tavolo aggiunto');
        tablesPane();
        $('#add-table input', pane).focus();
      } catch (err) {
        errorToast(err);
      }
    });
    pane.addEventListener('click', onTableClick);
  }

  async function onTableClick(e) {
    const btn = e.target.closest('button');
    const row = btn?.closest('.table-row');
    if (!row) return;
    const id = Number(row.dataset.id);
    const t = tables.find((x) => x.id === id);
    const idx = tables.indexOf(t);
    try {
      if (btn.matches('[data-up],[data-down]')) {
        const ids = tables.map((x) => x.id);
        const j = btn.matches('[data-up]') ? idx - 1 : idx + 1;
        [ids[idx], ids[j]] = [ids[j], ids[idx]];
        tables = (await api('/api/admin/tables/order', { method: 'POST', body: { ids } })).tables;
      } else if (btn.matches('[data-del]')) {
        if (!(await confirmDialog(`Eliminare «${t.name}»? Gli invitati resteranno senza tavolo.`, { ok: 'Elimina', danger: true }))) return;
        tables = (await api(`/api/admin/tables/${id}`, { method: 'DELETE' })).tables;
      } else if (btn.matches('[data-edit]')) {
        const { el, close } = sheet(`
          <h3 class="sheet-title">Modifica tavolo</h3>
          <form class="form">
            <label class="field"><span>Nome</span><input name="name" required value="${esc(t.name)}"/></label>
            <label class="field"><span>Descrizione</span><input name="description" value="${esc(t.description)}"/></label>
            <button class="btn primary block">Salva</button>
          </form>`);
        el.querySelector('form').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          try {
            tables = (
              await api(`/api/admin/tables/${id}`, {
                method: 'PATCH',
                body: { name: ev.target.name.value, description: ev.target.description.value },
              })
            ).tables;
            close();
            tablesPane();
          } catch (err) {
            errorToast(err);
          }
        });
        return;
      } else return;
      tablesPane();
    } catch (err) {
      errorToast(err);
    }
  }

  /* ---------- Floor plan ---------- */

  function floorPane() {
    resetPane();
    let selected = tables.find((t) => t.x == null)?.id ?? tables[0]?.id ?? null;
    const draw = () => {
      const floorplan = ctx.S.settings.floorplan ? `/uploads/${ctx.S.settings.floorplan}` : null;
      const sel = tables.find((t) => t.id === selected);
      pane.innerHTML = `
        <div class="card">
          <p class="small">Carica una foto o un disegno della sala, poi <b>scegli un tavolo e tocca la piantina</b> nel punto in cui si trova. Gli invitati vedranno il loro tavolo evidenziato.
          Senza piantina verrà mostrato uno schema automatico.</p>
          <div class="btn-row">
            <button class="btn small primary" id="fp-upload">${icon('upload')} ${floorplan ? 'Cambia piantina' : 'Carica piantina'}</button>
            ${floorplan ? `<button class="btn small ghost" id="fp-remove">${icon('trash')} Rimuovi</button>` : ''}
          </div>
        </div>
        ${
          tables.length
            ? `<div class="chips">${tables
                .map(
                  (t) =>
                    `<button class="chip ${t.id === selected ? 'on' : ''} ${t.x != null ? 'placed' : ''}" data-sel="${t.id}">${t.x != null ? icon('check') : ''}${esc(t.name)}</button>`,
                )
                .join('')}</div>
              <p class="small center">${sel ? `Tocca la piantina per posizionare <b>${esc(sel.name)}</b>` : ''}
              ${sel?.x != null ? ` · <button class="link" id="fp-unplace">rimuovi posizione</button>` : ''}</p>
              ${ctx.floorplanHTML({ floorplan, tables }, selected, { editable: true })}`
            : `<div class="note">Crea prima i tavoli nella scheda <a href="#admin/ospiti/tavoli">Tavoli</a>.</div>`
        }`;
    };
    draw();
    pane.addEventListener('click', async (e) => {
      try {
        const chip = e.target.closest('[data-sel]');
        if (chip) {
          selected = Number(chip.dataset.sel);
          return draw();
        }
        if (e.target.closest('#fp-upload')) {
          return pickFile(async (file) => {
            const [img] = await resizeImage(file, [{ max: 2400, quality: 0.88 }]);
            const form = new FormData();
            form.append('file', img.blob, 'floorplan.jpg');
            await uploadForm('/api/admin/upload/floorplan', form);
            await ctx.refreshState();
            toast('Piantina caricata');
            draw();
          });
        }
        if (e.target.closest('#fp-remove')) {
          await api('/api/admin/upload/floorplan', { method: 'DELETE' });
          await ctx.refreshState();
          return draw();
        }
        if (e.target.closest('#fp-unplace')) {
          tables = (await api(`/api/admin/tables/${selected}`, { method: 'PATCH', body: { x: null, y: null } })).tables;
          return draw();
        }
        const fp = e.target.closest('.floorplan.editable');
        if (fp && selected) {
          const rect = fp.getBoundingClientRect();
          const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
          const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
          tables = (await api(`/api/admin/tables/${selected}`, { method: 'PATCH', body: { x, y } })).tables;
          const next = tables.find((t) => t.x == null);
          if (next) selected = next.id;
          draw();
        }
      } catch (err) {
        errorToast(err);
      }
    });
  }

  /* ---------- Import ---------- */

  function importPane() {
    resetPane();
    pane.innerHTML = `
      <div class="card">
        <p>Il modo più veloce: copia le righe dal tuo foglio <b>Excel</b> o <b>Google Fogli</b> e incollale qui sotto.</p>
        <p class="small">Colonne nell'ordine: <b>Nome e cognome</b> · <b>Tavolo</b> · Email (facoltativa) · Posto (facoltativo).
        I tavoli vengono creati automaticamente. Puoi reimportare quando vuoi: gli invitati già presenti vengono aggiornati, non duplicati.</p>
        <label class="switch-row"><input type="checkbox" id="split-name"/> <span>Nome e cognome sono in due colonne separate</span></label>
        <textarea id="paste" rows="10" class="mono" placeholder="Mario Rossi&#9;Tavolo Positano&#9;mario@email.it
Anna Bianchi&#9;Tavolo Positano
Luca Verdi&#9;Tavolo Amalfi&#9;&#9;3"></textarea>
        <div id="preview"></div>
        <button class="btn primary" id="do-import" disabled>${icon('upload')} Importa</button>
      </div>`;
    let rows = [];
    const parse = () => {
      const split = $('#split-name', pane).checked;
      const lines = $('#paste', pane).value.split(/\r?\n/).filter((l) => l.trim());
      rows = lines
        .map((line) => {
          const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
          const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
          // Columns: name (1 or 2 cells) · table · email · seat. The email is recognised wherever
          // it is; an empty email column is dropped so the seat keeps its place.
          const emailCol = split ? 3 : 2;
          let at = cells.findIndex((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));
          if (at < 0 && cells.length > emailCol + 1 && !cells[emailCol]) at = emailCol;
          const email = at >= 0 ? cells[at] : '';
          let rest = at >= 0 ? cells.filter((_, i) => i !== at) : cells;
          if (split) rest = [`${rest[0] || ''} ${rest[1] || ''}`.trim(), ...rest.slice(2)];
          return { name: rest[0] || '', table: rest[1] || '', seat: rest[2] || '', email };
        })
        .filter((r) => r.name);
      if (rows.length && /nome|name/i.test(rows[0].name) && /tavol|table/i.test(rows[0].table)) rows.shift();
      const newTables = new Set(rows.map((r) => r.table).filter(Boolean));
      $('#preview', pane).innerHTML = rows.length
        ? `<p class="small"><b>${rows.length}</b> invitati · <b>${newTables.size}</b> tavoli</p>
           <div class="preview-table"><table><tr><th>Nome</th><th>Tavolo</th><th>Email</th><th>Posto</th></tr>${rows
             .slice(0, 8)
             .map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.table)}</td><td>${esc(r.email)}</td><td>${esc(r.seat)}</td></tr>`)
             .join('')}</table>${rows.length > 8 ? `<p class="small muted">…e altri ${rows.length - 8}</p>` : ''}</div>`
        : '';
      $('#do-import', pane).disabled = !rows.length;
      $('#do-import', pane).innerHTML = `${icon('upload')} Importa ${rows.length || ''} invitati`;
    };
    $('#paste', pane).addEventListener('input', parse);
    $('#split-name', pane).addEventListener('change', parse);
    $('#do-import', pane).addEventListener('click', async () => {
      try {
        const r = await api('/api/admin/guests/import', { method: 'POST', body: { rows } });
        guests = r.guests;
        tables = r.tables;
        toast(`Fatto! ${r.created} nuovi, ${r.updated} aggiornati, ${r.tablesCreated} tavoli creati`);
        ctx.navigate('admin/ospiti');
      } catch (err) {
        errorToast(err);
      }
    });
  }

  const panes = { invitati: guestsPane, tavoli: tablesPane, piantina: floorPane, importa: importPane };
  await panes[tab]();
}

function pickFile(onFile, accept = 'image/*') {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      await onFile(file);
    } catch (err) {
      errorToast(err);
    }
  });
  input.click();
}

/* ================================================================== */
/* Content & look                                                      */
/* ================================================================== */

function monogram(names) {
  const parts = String(names)
    .split(/\s*(?:&|\+|\se\s|\sand\s)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length >= 2 ? `${parts[0][0]}&${parts[1][0]}`.toUpperCase() : String(names).slice(0, 2).toUpperCase();
}

async function drawIcon(size, { accent, text, image, inset = 0 }) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (image) {
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    g.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size);
  } else {
    g.fillStyle = accent;
    g.fillRect(0, 0, size, size);
    const r = size * (0.36 - inset);
    g.strokeStyle = 'rgba(251,248,243,.55)';
    g.lineWidth = Math.max(1, size * 0.012);
    g.beginPath();
    g.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#FBF8F3';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `600 ${Math.round(size * (0.3 - inset * 0.5))}px "Cormorant Garamond", Georgia, serif`;
    g.fillText(text, size / 2, size / 2 + size * 0.015);
  }
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

async function uploadIcons({ accent, text, image }) {
  if (!image) await document.fonts.load('600 100px "Cormorant Garamond"').catch(() => {});
  const form = new FormData();
  form.append('kind', image ? 'photo' : 'monogram');
  form.append('i512', await drawIcon(512, { accent, text, image }), 'i512.png');
  form.append('i192', await drawIcon(192, { accent, text, image }), 'i192.png');
  form.append('i180', await drawIcon(180, { accent, text, image }), 'i180.png');
  form.append('m512', await drawIcon(512, { accent, text, image, inset: 0.06 }), 'm512.png');
  return uploadForm('/api/admin/icon', form);
}

function sectionEditor(sec, i, n) {
  return `
    <div class="section-editor card" data-i="${i}">
      <div class="se-head">
        <input class="se-icon" data-f="icon" value="${esc(sec.icon)}" maxlength="8" aria-label="Emoji" />
        <input class="se-title" data-f="title" value="${esc(sec.title)}" placeholder="Titolo" />
        <div class="se-tools">
          <button type="button" class="icon-btn" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Su">${icon('up')}</button>
          <button type="button" class="icon-btn" data-move="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Giù">${icon('down')}</button>
          <button type="button" class="icon-btn" data-remove aria-label="Elimina">${icon('trash')}</button>
        </div>
      </div>
      <label class="field"><span>Sottotitolo (es. orario)</span><input data-f="subtitle" value="${esc(sec.subtitle)}" /></label>
      <label class="field"><span>Testo</span><textarea data-f="body" rows="3">${esc(sec.body)}</textarea></label>
      <div class="field-row">
        <label class="field"><span>Testo del pulsante</span><input data-f="linkLabel" value="${esc(sec.linkLabel)}" placeholder="Es. Apri in Maps" /></label>
        <label class="field"><span>Link del pulsante</span><input data-f="linkUrl" value="${esc(sec.linkUrl)}" placeholder="https://maps.google.com/…" inputmode="url" /></label>
      </div>
    </div>`;
}

async function adminContent(main) {
  const O = await overview();
  const s = O.settings;
  let sections = structuredClone(s.sections || []);
  let accent = s.accent;

  main.innerHTML = `
    <div class="container admin">
      ${back}
      <h2 class="page-title">Contenuti e aspetto</h2>
      <form id="content-form" class="form">
        <section class="card">
          <h3 class="card-title small-title">💍 Gli sposi</h3>
          <label class="field"><span>Nomi</span><input name="coupleNames" required value="${esc(s.coupleNames)}" placeholder="Giulia & Marco" /></label>
          <label class="field"><span>Data e ora del matrimonio</span><input name="weddingDate" type="datetime-local" value="${isoToLocalInput(s.weddingDate, s.tz)}" /></label>
        </section>

        <section class="card">
          <h3 class="card-title small-title">🎨 Aspetto</h3>
          <div class="field"><span>Colore principale</span>
            <div class="swatches">${Object.entries(ACCENTS)
              .map(
                ([k, a]) =>
                  `<button type="button" class="swatch ${k === accent ? 'on' : ''}" data-accent="${k}" style="--c:${a.color}" title="${a.name}"><i></i><span>${a.name}</span></button>`,
              )
              .join('')}</div>
          </div>
          <div class="field"><span>Foto di copertina</span>
            <div class="cover-preview">${s.coverImage ? `<img src="/uploads/${esc(s.coverImage)}" alt="" />` : '<div class="muted small">Nessuna foto: verrà usato uno sfondo elegante</div>'}</div>
            <div class="btn-row"><button type="button" class="btn small ghost" id="cover-up">${icon('upload')} ${s.coverImage ? 'Cambia' : 'Carica'} foto</button>
            ${s.coverImage ? `<button type="button" class="btn small ghost" id="cover-rm">${icon('trash')} Rimuovi</button>` : ''}</div>
          </div>
          <div class="field"><span>Icona dell'app (quella che appare sul telefono)</span>
            <div class="icon-preview"><img src="/icon/icon-192.png?v=${s.iconVersion}" alt="" /></div>
            <div class="btn-row">
              <button type="button" class="btn small ghost" id="icon-mono">Genera con le iniziali</button>
              <button type="button" class="btn small ghost" id="icon-up">${icon('upload')} Usa una foto</button>
              ${s.customIcon ? `<button type="button" class="btn small ghost" id="icon-reset">Ripristina</button>` : ''}
            </div>
          </div>
        </section>

        <section class="card">
          <h3 class="card-title small-title">👋 Benvenuto</h3>
          <label class="field"><span>Titolo</span><input name="welcomeTitle" value="${esc(s.welcomeTitle)}" /></label>
          <label class="field"><span>Testo</span><textarea name="welcomeText" rows="5">${esc(s.welcomeText)}</textarea></label>
        </section>

        <h3 class="section-label">Schede informative</h3>
        <p class="small muted">Cerimonia, ricevimento, programma, dress code, lista nozze… Per i luoghi incolla il link di Google Maps nel pulsante.</p>
        <div id="sections"></div>
        <button type="button" class="btn ghost block" id="add-section">${icon('plus')} Aggiungi scheda</button>

        <div class="save-bar"><button class="btn primary block big">${icon('check')} Salva modifiche</button></div>
      </form>
    </div>`;

  const secBox = $('#sections', main);
  const readSections = () =>
    $$('.section-editor', secBox).map((el) =>
      Object.fromEntries($$('[data-f]', el).map((inp) => [inp.dataset.f, inp.value])),
    );
  const drawSections = () => {
    secBox.innerHTML = sections.map((sec, i) => sectionEditor(sec, i, sections.length)).join('');
  };
  drawSections();

  $('#add-section', main).addEventListener('click', () => {
    sections = readSections();
    sections.push({ icon: '✨', title: '', subtitle: '', body: '', linkLabel: '', linkUrl: '' });
    drawSections();
    $$('.se-title', secBox).pop().focus();
  });
  secBox.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const i = Number(btn.closest('[data-i]').dataset.i);
    sections = readSections();
    if (btn.dataset.move) {
      const j = i + Number(btn.dataset.move);
      [sections[i], sections[j]] = [sections[j], sections[i]];
    } else if (btn.matches('[data-remove]')) {
      if (!(await confirmDialog('Eliminare questa scheda?', { ok: 'Elimina', danger: true }))) return;
      sections.splice(i, 1);
    }
    drawSections();
  });

  main.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    try {
      if (t.dataset.accent) {
        accent = t.dataset.accent;
        $$('.swatch', main).forEach((b) => b.classList.toggle('on', b === t));
        document.documentElement.style.setProperty('--accent', ACCENTS[accent].color);
      } else if (t.id === 'cover-up') {
        pickFile(async (file) => {
          const [img] = await resizeImage(file, [{ max: 2000, quality: 0.85 }]);
          const form = new FormData();
          form.append('file', img.blob, 'cover.jpg');
          await uploadForm('/api/admin/upload/cover', form);
          await ctx.refreshState();
          toast('Copertina aggiornata');
          ctx.route();
        });
      } else if (t.id === 'cover-rm') {
        await api('/api/admin/upload/cover', { method: 'DELETE' });
        await ctx.refreshState();
        ctx.route();
      } else if (t.id === 'icon-mono') {
        const names = $('[name=coupleNames]', main).value;
        await uploadIcons({ accent: ACCENTS[accent].color, text: monogram(names) });
        toast('Icona creata ✨');
        ctx.route();
      } else if (t.id === 'icon-up') {
        pickFile(async (file) => {
          const url = URL.createObjectURL(file);
          const image = await new Promise((res, rej) => {
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = () => rej(new Error('Immagine non valida'));
            im.src = url;
          });
          await uploadIcons({ image });
          URL.revokeObjectURL(url);
          toast('Icona aggiornata');
          ctx.route();
        });
      } else if (t.id === 'icon-reset') {
        await api('/api/admin/icon', { method: 'DELETE' });
        ctx.route();
      }
    } catch (err) {
      errorToast(err);
    }
  });

  $('#content-form', main).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('.save-bar button');
    btn.disabled = true;
    try {
      const namesChanged = f.coupleNames.value.trim() !== s.coupleNames;
      await api('/api/admin/settings', {
        method: 'PATCH',
        body: {
          coupleNames: f.coupleNames.value,
          weddingDate: localInputToIso(f.weddingDate.value, s.tz),
          accent,
          welcomeTitle: f.welcomeTitle.value,
          welcomeText: f.welcomeText.value,
          sections: readSections(),
        },
      });
      // Keep the home-screen icon in tune with names and colour unless the couple uploaded a photo.
      if (s.customIcon !== 'photo' && (!s.customIcon || namesChanged || accent !== s.accent)) {
        await uploadIcons({ accent: ACCENTS[accent].color, text: monogram(f.coupleNames.value) }).catch(() => {});
      }
      await ctx.refreshState();
      ctx.renderShell();
      toast('Modifiche salvate ✨');
      ctx.navigate('admin');
    } catch (err) {
      errorToast(err);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ================================================================== */
/* Email settings                                                      */
/* ================================================================== */

async function adminEmail(main) {
  const O = await overview();
  const e = O.settings.email;
  main.innerHTML = `
    <div class="container admin">
      ${back}
      <h2 class="page-title">Email</h2>
      <section class="card">
        ${
          O.emailEnabled
            ? `<div class="note ok">${icon('check')} Email attive${O.emailDev ? ' (modalità prova: le email vengono salvate sul server, non spedite)' : ''}</div>`
            : `<div class="note warn">Email non ancora configurate</div>`
        }
        <p class="small">Le email servono per mandare a ogni invitato il suo tavolo e i codici di accesso. Le <b>notifiche push</b> invece funzionano già, senza configurare nulla.</p>
      </section>

      ${
        O.emailFromEnv
          ? `<section class="card"><p>Le email sono configurate tramite le variabili del server (SMTP_HOST…).</p></section>`
          : `<form class="card form" id="mail-form">
        <label class="field"><span>Servizio</span>
          <select name="provider">
            <option value="gmail" ${e.provider === 'gmail' ? 'selected' : ''}>Gmail (consigliato, gratis fino a 500 email/giorno)</option>
            <option value="brevo" ${e.provider === 'brevo' ? 'selected' : ''}>Brevo (gratis fino a 300 email/giorno)</option>
            <option value="custom" ${e.provider === 'custom' ? 'selected' : ''}>Altro (SMTP)</option>
          </select></label>

        <div class="guide" data-for="gmail">
          <ol class="steps">
            <li>Assicurati che il tuo account Google abbia la <b>verifica in due passaggi</b> attiva.</li>
            <li>Apri <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">myaccount.google.com/apppasswords</a>.</li>
            <li>Scrivi un nome (es. «Matrimonio») e tocca <b>Crea</b>.</li>
            <li>Copia la password di 16 lettere e incollala qui sotto.</li>
          </ol>
        </div>
        <div class="guide" data-for="brevo">
          <ol class="steps">
            <li>Crea un account gratuito su <a href="https://www.brevo.com" target="_blank" rel="noopener">brevo.com</a> e verifica il tuo indirizzo mittente.</li>
            <li>Vai su <b>SMTP & API › SMTP</b> e genera una chiave SMTP.</li>
            <li>Copia qui «Login» e «Chiave SMTP».</li>
          </ol>
        </div>

        <div class="field-row" data-for="custom">
          <label class="field"><span>Server SMTP</span><input name="host" value="${esc(e.host)}" placeholder="smtp.esempio.it" /></label>
          <label class="field narrow"><span>Porta</span><input name="port" inputmode="numeric" value="${esc(e.port)}" /></label>
        </div>
        <label class="switch-row" data-for="custom"><input type="checkbox" name="secure" ${e.secure ? 'checked' : ''}/> <span>Connessione SSL (porta 465)</span></label>

        <label class="field"><span data-label-user>Indirizzo Gmail</span><input name="user" autocomplete="off" autocapitalize="off" value="${esc(e.user)}" /></label>
        <label class="field"><span data-label-pass>Password per le app</span><input name="pass" type="password" autocomplete="new-password" placeholder="${e.hasPass ? '•••••••• (già salvata)' : ''}" /></label>
        <label class="field" data-for="brevo custom"><span>Email mittente</span><input name="fromEmail" type="email" value="${esc(e.fromEmail)}" placeholder="sposi@esempio.it" /></label>
        <label class="field"><span>Nome mittente</span><input name="fromName" value="${esc(e.fromName)}" placeholder="${esc(O.settings.coupleNames)}" /></label>
        <button class="btn primary">${icon('check')} Salva</button>
      </form>`
      }

      <form class="card form" id="test-form">
        <h3 class="card-title small-title">Prova</h3>
        <label class="field"><span>La tua email (per prove e anteprime)</span><input name="to" type="email" required value="${esc(O.settings.adminEmail)}" /></label>
        <div class="btn-row">
          <button class="btn primary" name="test">${icon('send')} Invia email di prova</button>
          <button class="btn ghost" type="button" id="preview-seat">${icon('eye')} Anteprima email del tavolo</button>
        </div>
      </form>
    </div>`;

  const form = $('#mail-form', main);
  if (form) {
    const sync = () => {
      const p = form.provider.value;
      $$('[data-for]', form).forEach((el) => (el.hidden = !el.dataset.for.split(' ').includes(p)));
      form.querySelector('[data-label-user]').textContent =
        p === 'gmail' ? 'Indirizzo Gmail' : p === 'brevo' ? 'Login SMTP' : 'Utente';
      form.querySelector('[data-label-pass]').textContent =
        p === 'gmail' ? 'Password per le app' : p === 'brevo' ? 'Chiave SMTP' : 'Password';
    };
    sync();
    form.provider.addEventListener('change', sync);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await api('/api/admin/settings', {
          method: 'PATCH',
          body: {
            email: {
              provider: form.provider.value,
              host: form.host.value,
              port: form.port.value,
              secure: form.secure.checked,
              user: form.user.value.trim(),
              pass: form.pass.value,
              fromEmail: form.fromEmail.value.trim(),
              fromName: form.fromName.value.trim(),
            },
          },
        });
        toast('Salvato! Ora invia una email di prova 👇');
        ctx.route();
      } catch (err) {
        errorToast(err);
      }
    });
  }
  $('#test-form', main).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const to = ev.target.to.value.trim();
    const btn = ev.target.querySelector('[name=test]');
    btn.disabled = true;
    try {
      await api('/api/admin/settings', { method: 'PATCH', body: { adminEmail: to } });
      await api('/api/admin/email/test', { method: 'POST', body: { to } });
      toast('Email inviata! Controlla la posta (anche lo spam) 📬');
    } catch (err) {
      errorToast(err);
    } finally {
      btn.disabled = false;
    }
  });
  $('#preview-seat', main).addEventListener('click', async () => {
    const to = $('#test-form [name=to]', main).value.trim();
    try {
      await api('/api/admin/settings', { method: 'PATCH', body: { adminEmail: to } });
      await api('/api/admin/reveal/preview', { method: 'POST', body: { to } });
      toast('Anteprima inviata 📬');
    } catch (err) {
      errorToast(err);
    }
  });
}

/* ================================================================== */
/* Share                                                               */
/* ================================================================== */

async function adminShare(main) {
  const O = await overview();
  const url = O.publicUrl;
  const names = O.settings.coupleNames;
  const message = `Ciao! 💍 Abbiamo preparato l'app del nostro matrimonio: trovi tutte le informazioni, scoprirai il tuo tavolo e il giorno delle nozze potremo condividere foto e messaggi tutti insieme.\n\nRegistrati qui 👉 ${url}\n\nConsiglio: aggiungila alla schermata Home per ricevere le notifiche (su iPhone apri il link con Safari › Condividi › Aggiungi alla schermata Home).\n\n${names}`;
  main.innerHTML = `
    <div class="container admin">
      ${back}
      <h2 class="page-title">Condividi</h2>
      <section class="card">
        <h3 class="card-title small-title">Il link dell'app</h3>
        <div class="link-box"><code>${esc(url)}</code></div>
        <div class="btn-row">
          <button class="btn primary small" data-copy="${esc(url)}">${icon('copy')} Copia link</button>
          ${navigator.share ? `<button class="btn ghost small" id="share">${icon('share')} Condividi</button>` : ''}
        </div>
      </section>

      <section class="card">
        <h3 class="card-title small-title">Messaggio pronto per WhatsApp</h3>
        <textarea id="wa-text" rows="8">${esc(message)}</textarea>
        <div class="btn-row">
          <a class="btn primary small" id="wa" target="_blank" rel="noopener">Invia su WhatsApp</a>
          <button class="btn ghost small" id="wa-copy">${icon('copy')} Copia messaggio</button>
        </div>
      </section>

      <section class="card center">
        <h3 class="card-title small-title">QR code</h3>
        <p class="small muted">Stampalo sulle partecipazioni, sui segnaposto o su un cartello all'ingresso.</p>
        <div class="print-card">
          <div class="pc-kicker">Il matrimonio di</div>
          <div class="pc-names">${esc(names)}</div>
          <img class="qr" src="/api/admin/qr.svg" alt="QR code" />
          <div class="pc-text">Inquadra il codice con la fotocamera<br>per entrare nell'app: info, tavoli e foto!</div>
          <div class="pc-url">${esc(url.replace(/^https?:\/\//, ''))}</div>
        </div>
        <div class="btn-row center">
          <button class="btn primary small" id="print">Stampa cartoncino</button>
          <a class="btn ghost small" href="/api/admin/qr.svg" download="qr-matrimonio.svg">${icon('download')} Scarica QR</a>
        </div>
      </section>
    </div>`;
  const wa = $('#wa', main);
  const syncWa = () => (wa.href = `https://wa.me/?text=${encodeURIComponent($('#wa-text', main).value)}`);
  syncWa();
  $('#wa-text', main).addEventListener('input', syncWa);
  $('#wa-copy', main).addEventListener('click', () => copyText($('#wa-text', main).value));
  main.addEventListener('click', (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) copyText(c.dataset.copy);
  });
  $('#share', main)?.addEventListener('click', () =>
    navigator.share({ title: names, text: `L'app del matrimonio di ${names}`, url }).catch(() => {}),
  );
  $('#print', main).addEventListener('click', () => {
    document.body.classList.add('printing');
    window.print();
    setTimeout(() => document.body.classList.remove('printing'), 500);
  });
}

/* ================================================================== */
/* Projector screen                                                    */
/* ================================================================== */

export async function renderScreen(main, context) {
  ctx = context;
  document.body.classList.add('screen-mode');
  ctx.onCleanup(() => document.body.classList.remove('screen-mode'));
  const s = ctx.S.settings;
  main.innerHTML = `
    <div class="screen">
      <div class="screen-stage">
        <img class="screen-img" id="img-a" alt="" /><img class="screen-img" id="img-b" alt="" />
        <div class="screen-caption" id="cap"></div>
        <div class="screen-empty" id="sempty">📸<br>Condividete le vostre foto!</div>
      </div>
      <aside class="screen-side">
        <div class="screen-title">${esc(s.coupleNames)}</div>
        <div class="screen-msgs" id="smsgs"></div>
        <div class="screen-qr"><img src="/api/admin/qr.svg" alt="" /><div>Inquadra e partecipa!<br><b>${esc(location.host)}</b></div></div>
      </aside>
      <div class="screen-tools">
        <button class="icon-btn" id="fs" aria-label="Schermo intero">${icon('tv')}</button>
        <a class="icon-btn" href="#admin" aria-label="Esci">${icon('x')}</a>
      </div>
    </div>`;

  let photos = [];
  let queue = []; // new photos jump the line
  let idx = -1;
  let front = $('#img-a', main);
  let backImg = $('#img-b', main);
  const msgs = $('#smsgs', main);

  const [p, m] = await Promise.all([api('/api/messages?kind=photo&limit=100'), api('/api/messages?limit=60')]);
  photos = p.messages;
  const texts = m.messages.filter((x) => x.kind !== 'photo').slice(-8);
  const msgHTML = (x) =>
    `<div class="smsg ${x.kind === 'announce' ? 'announce' : ''}" data-id="${x.id}"><b>${esc(x.author)}</b><p>${richText(x.text)}</p></div>`;
  msgs.innerHTML = texts.map(msgHTML).join('');

  const showPhoto = (photo) => {
    $('#sempty', main).hidden = true;
    backImg.onload = () => {
      backImg.classList.add('on');
      front.classList.remove('on');
      [front, backImg] = [backImg, front];
    };
    backImg.src = photo.photo;
    $('#cap', main).innerHTML = `<b>${esc(photo.author)}</b>${photo.text ? ` · ${esc(photo.text)}` : ''}`;
  };
  const next = () => {
    if (queue.length) return showPhoto(queue.shift());
    if (!photos.length) return;
    idx = (idx + 1) % photos.length;
    showPhoto(photos[idx]);
  };
  next();
  const timer = setInterval(next, 7000);
  ctx.onCleanup(() => clearInterval(timer));

  ctx.on('msg', (x) => {
    if (x.kind === 'photo') {
      photos.push(x);
      queue.push(x);
      if ($('#sempty', main).hidden === false) next();
      return;
    }
    msgs.insertAdjacentHTML('beforeend', msgHTML(x));
    while (msgs.children.length > 8) msgs.firstElementChild.remove();
  });
  ctx.on('del', ({ id }) => {
    photos = photos.filter((x) => x.id !== id);
    queue = queue.filter((x) => x.id !== id);
    msgs.querySelector(`[data-id="${id}"]`)?.remove();
  });
  $('#fs', main).addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
}
