import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, getSettings, publicUrl } from './db.js';
import { CODES, monthLabel, monthName, dayLabel, deadline, stamp, describeEntry } from '../public/js/cal.js';

const PRESETS = {
  gmail: { host: 'smtp.gmail.com', port: 465, secure: true },
  brevo: { host: 'smtp-relay.brevo.com', port: 587, secure: false },
};

const DEV = process.env.MAIL_DEV === '1';
const GREEN = '#33483C';

/** Effective SMTP configuration (env vars win over the settings page). */
export function mailConfig() {
  const env = process.env;
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    return {
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === 'true' || Number(env.SMTP_PORT) === 465,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      fromEmail: env.MAIL_FROM || env.SMTP_USER,
      fromName: env.MAIL_FROM_NAME || '',
    };
  }
  const e = getSettings().email || {};
  const preset = PRESETS[e.provider];
  const cfg = {
    host: preset ? preset.host : e.host,
    port: preset ? preset.port : Number(e.port) || 587,
    secure: preset ? preset.secure : !!e.secure || Number(e.port) === 465,
    user: e.user,
    pass: e.pass,
    fromEmail: e.fromEmail || e.user,
    fromName: e.fromName || '',
  };
  return cfg.host && cfg.user && cfg.pass ? cfg : null;
}

export const emailEnabled = () => DEV || !!mailConfig();
export const emailFromEnv = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
let transporterKey = '';

function getTransporter() {
  if (DEV) {
    if (!transporter) transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }
  const cfg = mailConfig();
  if (!cfg) return null;
  const key = JSON.stringify(cfg);
  if (key !== transporterKey) {
    transporter?.close?.();
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      pool: true,
      maxConnections: 1,
      rateDelta: 1000,
      rateLimit: 3,
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 30000,
    });
    transporterKey = key;
  }
  return transporter;
}

export async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) throw new Error('Email non configurata');
  const cfg = mailConfig();
  const from = {
    name: cfg?.fromName || `Presenze ${getSettings().companyName}`,
    address: cfg?.fromEmail || 'presenze@localhost',
  };
  const info = await t.sendMail({ from, to, subject, html, text });
  if (DEV) {
    const dir = path.join(DATA_DIR, 'outbox');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${String(to).replace(/[^a-z0-9@.]/gi, '_')}.json`);
    fs.writeFileSync(file, JSON.stringify({ to, subject, html, text }, null, 2));
  }
  return info;
}

/** Send without throwing: returns true when the email went out. */
export async function trySend(msg) {
  if (!emailEnabled() || !msg.to) return false;
  try {
    await sendMail(msg);
    return true;
  } catch (err) {
    console.warn('[mail]', msg.to, err.message);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout({ preheader = '', body, cta, footer = '' }) {
  const company = getSettings().companyName;
  const button = cta
    ? `<tr><td align="center" style="padding:8px 32px 32px">
         <a href="${esc(cta.url)}" style="display:inline-block;background:${GREEN};color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:999px">${esc(cta.label)}</a>
       </td></tr>`
    : '';
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#F2EFE8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#23261F">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2EFE8;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#FFFFFF;border-radius:18px;overflow:hidden;border:1px solid #E3DED3">
<tr><td align="center" style="padding:28px 32px 8px">
  <div style="font-size:22px;letter-spacing:6px;font-weight:600;color:${GREEN}">${esc(company.toUpperCase())}</div>
  <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#7C8176;margin-top:4px">Presenze del personale</div>
  <div style="width:40px;height:2px;background:${GREEN};margin:18px auto 0"></div>
</td></tr>
<tr><td style="padding:16px 32px 16px;font-size:16px;line-height:1.6">${body}</td></tr>
${button}
</table>
<div style="font-size:12px;color:#8D9287;margin-top:16px;max-width:540px">${footer || `Email automatica dell'app presenze di ${esc(company)}.`}</div>
</td></tr></table></body></html>`;
}

const appUrl = (month) => `${publicUrl()}/${month ? `#mese/${month}` : ''}`;

export function accessEmail(user, link, { reset = false } = {}) {
  const company = getSettings().companyName;
  const body = reset
    ? `<p style="margin:0 0 16px">Ciao ${esc(user.first_name)},<br>hai chiesto di reimpostare la password dell'app presenze. Tocca il pulsante e scegline una nuova.</p>
       <p style="margin:0;color:#6A6F64;font-size:14px">Il link vale un'ora. Se non sei stato tu, ignora questa email: la password attuale resta valida.</p>`
    : `<p style="margin:0 0 16px">Ciao ${esc(user.first_name)},<br>da oggi segnali le tue presenze a ${esc(company)} con l'app: giorni lavorati, ferie, permessi e malattia, direttamente dal telefono.</p>
       <p style="margin:0 0 8px">Tocca il pulsante, scegli la tua password personale e sei dentro. Poi aggiungi l'app alla schermata Home: ti ricorderà la scadenza di ogni mese.</p>
       <p style="margin:0;color:#6A6F64;font-size:14px">Il link è personale: non inoltrarlo. Vale 14 giorni.</p>`;
  return {
    subject: reset ? 'Reimposta la password delle presenze' : `Benvenuto nell'app presenze di ${company}`,
    html: layout({ preheader: reset ? 'Scegli una nuova password' : 'Attiva il tuo account', body, cta: { label: reset ? 'Scegli la nuova password' : 'Attiva il mio account', url: link } }),
    text: `Ciao ${user.first_name},\n${reset ? 'per scegliere una nuova password' : "per attivare il tuo account dell'app presenze"} apri questo link personale:\n${link}`,
  };
}

const REMINDER = {
  pre: (m) => ({ title: `Presenze di ${monthName(m)}: scadenza giovedì`, lead: `ti ricordo di inserire e confermare le presenze di <b>${monthLabel(m)}</b> entro <b>${dayLabel(deadline(m))}</b>.` }),
  due: (m) => ({ title: `Oggi scadono le presenze di ${monthName(m)}`, lead: `oggi, <b>${dayLabel(deadline(m))}</b>, è l'ultimo giorno per inserire e confermare le presenze di <b>${monthLabel(m)}</b>.` }),
  late: (m) => ({ title: `Presenze di ${monthName(m)} in ritardo`, lead: `le presenze di <b>${monthLabel(m)}</b> non sono ancora confermate: la scadenza era <b>${dayLabel(deadline(m))}</b>. Inseriscile appena puoi.` }),
  manual: (m) => ({ title: `Promemoria: presenze di ${monthName(m)}`, lead: `ti ricordo di inserire e confermare le presenze di <b>${monthLabel(m)}</b> (scadenza ${dayLabel(deadline(m))}).` }),
};

export const reminderText = (kind, month) => REMINDER[kind.split('-')[0]](month);

export function reminderEmail(user, month, kind) {
  const r = reminderText(kind, month);
  const body = `<p style="margin:0 0 16px">Ciao ${esc(user.first_name)},<br>${r.lead}</p>
    <p style="margin:0;color:#6A6F64;font-size:14px">Basta aprire l'app, toccare i giorni e premere «Conferma il mese».</p>`;
  const plain = r.lead.replace(/<[^>]+>/g, '');
  return {
    subject: r.title,
    html: layout({ preheader: plain, body, cta: { label: 'Inserisci le presenze', url: appUrl(month) } }),
    text: `Ciao ${user.first_name}, ${plain}\n\n${appUrl(month)}`,
  };
}

function totalsLine(t) {
  const perm = t.permHours ? ` (di cui ${String(t.permHours).replace('.', ',')} h a ore)` : '';
  return `Lavorati ${t.L} · Ferie ${t.F} · Permessi ${t.P}${perm} · Malattia ${t.M}`;
}

/** Receipt the employee keeps: what was confirmed, when, and the fingerprints that certify it. */
export function receiptEmail(user, { month, at, digest, totals, entries, auditId, auditHash }) {
  const rows = Object.keys(entries)
    .sort()
    .map((day) => {
      const e = entries[day];
      return `<tr><td style="padding:4px 8px 4px 0;color:#6A6F64;white-space:nowrap">${esc(dayLabel(day))}</td><td style="padding:4px 0"><b style="color:${CODES[e.code].color}">${esc(describeEntry(e))}</b></td></tr>`;
    })
    .join('');
  const body = `<p style="margin:0 0 16px">Ciao ${esc(user.first_name)},<br>hai confermato le presenze di <b>${esc(monthLabel(month))}</b> il <b>${esc(stamp(at))}</b>. Ecco la tua ricevuta.</p>
    <div style="background:#F4F2EC;border-radius:12px;padding:14px 16px;margin:0 0 16px;font-weight:600">${esc(totalsLine(totals))}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 16px">${rows || '<tr><td>Nessun giorno inserito</td></tr>'}</table>
    <p style="margin:0;color:#6A6F64;font-size:12px;line-height:1.5">Ricevuta n. ${auditId} del registro presenze<br>Impronta del mese: <span style="font-family:monospace">${esc(digest)}</span><br>Impronta del registro: <span style="font-family:monospace">${esc(auditHash)}</span></p>`;
  return {
    subject: `Ricevuta: presenze di ${monthLabel(month)} confermate`,
    html: layout({ preheader: totalsLine(totals), body, cta: { label: "Apri l'app", url: appUrl(month) }, footer: 'Conserva questa email: certifica cosa hai confermato e quando.' }),
    text: `Hai confermato le presenze di ${monthLabel(month)} il ${stamp(at)}.\n${totalsLine(totals)}\n\n${Object.keys(entries)
      .sort()
      .map((d) => `${dayLabel(d)}: ${describeEntry(entries[d])}`)
      .join('\n')}\n\nRicevuta n. ${auditId}\nImpronta del mese: ${digest}\nImpronta del registro: ${auditHash}`,
  };
}

/** Owner's summary after a deadline (or on request). rows: [{ name, state, late, totals }] */
export function summaryEmail(month, rows, head) {
  const missing = rows.filter((r) => r.state !== 'ok');
  const list = rows
    .map(
      (r) => `<tr>
        <td style="padding:6px 8px 6px 0">${esc(r.name)}</td>
        <td style="padding:6px 0;text-align:right;white-space:nowrap;color:${r.state === 'ok' ? '#3F6B4E' : '#B4473F'};font-weight:600">${r.state === 'ok' ? 'Consegnato' : r.state === 'changed' ? 'Da riconfermare' : 'Mancante'}</td></tr>`,
    )
    .join('');
  const body = `<p style="margin:0 0 16px">Presenze di <b>${esc(monthLabel(month))}</b> (scadenza ${esc(dayLabel(deadline(month)))}): <b>${rows.length - missing.length} su ${rows.length}</b> consegnate.${missing.length ? ' A chi manca è appena arrivato un promemoria.' : ' Tutto in ordine! ✅'}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;border-top:1px solid #E3DED3">${list}</table>
    ${head ? `<p style="margin:16px 0 0;color:#6A6F64;font-size:12px">Sigillo del registro: evento n. ${head.id} · <span style="font-family:monospace">${esc(head.hash)}</span></p>` : ''}`;
  return {
    subject: missing.length
      ? `Presenze di ${monthName(month)}: mancano ${missing.length} dipendent${missing.length === 1 ? 'e' : 'i'}`
      : `Presenze di ${monthName(month)}: tutte consegnate ✅`,
    html: layout({ preheader: `${rows.length - missing.length} su ${rows.length} consegnate`, body, cta: { label: 'Apri il riepilogo', url: appUrl(month) } }),
    text: `Presenze di ${monthLabel(month)}: ${rows.length - missing.length} su ${rows.length} consegnate.\n${missing.length ? `Mancano: ${missing.map((r) => r.name).join(', ')}` : 'Tutte consegnate.'}\n${appUrl(month)}`,
  };
}

/** Owner's note when someone changes a month after confirming it. */
export function changedEmail(user, month, changes) {
  const list = changes.map((c) => `<li>${esc(dayLabel(c.day))}: ${esc(describeEntry(c.before))} → <b>${esc(describeEntry(c.after))}</b></li>`).join('');
  const name = `${user.first_name} ${user.last_name}`.trim();
  return {
    subject: `${name} ha corretto le presenze di ${monthName(month)}`,
    html: layout({
      preheader: `${changes.length} modifiche dopo la consegna`,
      body: `<p style="margin:0 0 12px"><b>${esc(name)}</b> ha riconfermato le presenze di <b>${esc(monthLabel(month))}</b> con queste modifiche rispetto alla consegna precedente:</p><ul style="margin:0;padding-left:20px">${list}</ul>`,
      cta: { label: 'Vedi il registro', url: appUrl(month) },
    }),
    text: `${name} ha corretto le presenze di ${monthLabel(month)}:\n${changes.map((c) => `${dayLabel(c.day)}: ${describeEntry(c.before)} -> ${describeEntry(c.after)}`).join('\n')}`,
  };
}

export function testEmail() {
  return {
    subject: '✅ Email di prova: funziona!',
    html: layout({
      preheader: 'Configurazione email completata',
      body: `<p style="margin:0">Perfetto! Se leggi questo messaggio le email dell'app presenze funzionano: inviti, promemoria e ricevute partiranno da questo indirizzo.</p>`,
      cta: { label: "Apri l'app", url: appUrl() },
    }),
    text: "Se leggi questo messaggio le email dell'app presenze funzionano.",
  };
}
