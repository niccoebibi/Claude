import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, getSettings, publicUrl } from './db.js';
import { ACCENTS } from './theme.js';

const PRESETS = {
  gmail: { host: 'smtp.gmail.com', port: 465, secure: true },
  brevo: { host: 'smtp-relay.brevo.com', port: 587, secure: false },
};

const DEV = process.env.MAIL_DEV === '1';

/** Effective SMTP configuration (env vars win over the admin panel). */
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
    name: cfg?.fromName || getSettings().coupleNames,
    address: cfg?.fromEmail || 'sposi@localhost',
  };
  const info = await t.sendMail({ from, to, subject, html, text });
  if (DEV) {
    const dir = path.join(DATA_DIR, 'outbox');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${String(to).replace(/[^a-z0-9@.]/gi, '_')}.json`);
    fs.writeFileSync(file, JSON.stringify({ to, subject, html, text }, null, 2));
  }
  return info;
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

function accentColor() {
  return (ACCENTS[getSettings().accent] || ACCENTS.salvia).color;
}

function weddingDateLabel() {
  const s = getSettings();
  if (!s.weddingDate) return '';
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: s.tz || 'Europe/Rome',
  }).format(new Date(s.weddingDate));
}

function layout({ preheader = '', body, cta }) {
  const s = getSettings();
  const accent = accentColor();
  const button = cta
    ? `<tr><td align="center" style="padding:8px 32px 32px">
         <a href="${esc(cta.url)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:999px">${esc(cta.label)}</a>
       </td></tr>`
    : '';
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#F4EFE7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2E2A26">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EFE7;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFDF9;border-radius:20px;overflow:hidden;border:1px solid #E8E0D4">
<tr><td align="center" style="padding:32px 32px 8px">
  <div style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:${accent}">Il matrimonio di</div>
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.2;margin-top:6px;color:#2E2A26">${esc(s.coupleNames)}</div>
  ${weddingDateLabel() ? `<div style="font-size:14px;color:#8A8077;margin-top:6px">${esc(weddingDateLabel())}</div>` : ''}
  <div style="width:48px;height:2px;background:${accent};margin:20px auto 0"></div>
</td></tr>
<tr><td style="padding:16px 32px 16px;font-size:16px;line-height:1.6">${body}</td></tr>
${button}
</table>
<div style="font-size:12px;color:#A39A90;margin-top:16px">Hai ricevuto questa email perché sei tra gli invitati del matrimonio.</div>
</td></tr></table></body></html>`;
}

export function seatingEmail(guest, table, mates) {
  const s = getSettings();
  const accent = accentColor();
  const url = `${publicUrl()}/login?key=${encodeURIComponent(guest.token)}&go=tavolo`;
  const intro = s.revealMessage?.trim() || 'è arrivato il momento che aspettavi: ecco dove siederai!';
  const others = mates.filter((m) => m.id !== guest.id).map((m) => m.name);
  const body = `
    <p style="margin:0 0 16px">Ciao ${esc(firstName(guest.name))},<br>${nl2br(intro)}</p>
    <div style="text-align:center;background:#F7F2EA;border-radius:16px;padding:24px 16px;margin:8px 0 20px">
      <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8A8077">Il tuo tavolo</div>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.2;color:${accent};margin-top:8px">${esc(table.name)}</div>
      ${table.description ? `<div style="font-size:15px;color:#6B625A;margin-top:8px">${nl2br(table.description)}</div>` : ''}
      ${guest.seat ? `<div style="font-size:15px;margin-top:10px">Posto: <b>${esc(guest.seat)}</b></div>` : ''}
    </div>
    ${
      others.length
        ? `<p style="margin:0 0 6px;font-weight:600">Con te al tavolo:</p>
           <p style="margin:0 0 8px;color:#4A433D">${others.map(esc).join(' · ')}</p>`
        : ''
    }`;
  return {
    subject: `🪑 Il tuo tavolo al matrimonio di ${s.coupleNames}`,
    html: layout({ preheader: `Sarai al tavolo ${table.name}`, body, cta: { label: 'Vedi la piantina', url } }),
    text: `Ciao ${firstName(guest.name)}, ${intro}\n\nIl tuo tavolo: ${table.name}${table.description ? `\n${table.description}` : ''}${guest.seat ? `\nPosto: ${guest.seat}` : ''}${others.length ? `\n\nCon te al tavolo: ${others.join(', ')}` : ''}\n\nVedi la piantina: ${url}`,
  };
}

export function loginCodeEmail(code, guests) {
  const links = guests
    .map(
      (g) =>
        `<a href="${esc(`${publicUrl()}/login?key=${encodeURIComponent(g.token)}`)}" style="color:${accentColor()}">Entra come ${esc(g.name)}</a>`,
    )
    .join('<br>');
  const body = `
    <p style="margin:0 0 16px">Ecco il tuo codice per accedere all'app:</p>
    <div style="text-align:center;font-size:40px;letter-spacing:10px;font-weight:700;background:#F7F2EA;border-radius:16px;padding:20px 8px;margin-bottom:20px">${esc(code)}</div>
    <p style="margin:0 0 8px;color:#6B625A;font-size:14px">Il codice vale 15 minuti. In alternativa tocca qui:</p>
    <p style="margin:0">${links}</p>`;
  return {
    subject: `Il tuo codice di accesso: ${code}`,
    html: layout({ preheader: `Codice: ${code}`, body }),
    text: `Il tuo codice di accesso è ${code} (valido 15 minuti).`,
  };
}

export function announceEmail(title, text) {
  const body = `
    ${title ? `<p style="margin:0 0 12px;font-family:Georgia,serif;font-size:24px">${esc(title)}</p>` : ''}
    <p style="margin:0">${nl2br(text)}</p>`;
  return {
    subject: title || `Novità dal matrimonio di ${getSettings().coupleNames}`,
    html: layout({ preheader: text.slice(0, 90), body, cta: { label: "Apri l'app", url: publicUrl() } }),
    text: `${title ? `${title}\n\n` : ''}${text}\n\n${publicUrl()}`,
  };
}

export function testEmail() {
  return {
    subject: '✅ Email di prova: funziona!',
    html: layout({
      preheader: 'Configurazione email completata',
      body: `<p style="margin:0">Perfetto! Se leggi questo messaggio le email dell'app funzionano correttamente. 🎉</p>`,
      cta: { label: "Apri l'app", url: publicUrl() },
    }),
    text: "Se leggi questo messaggio le email dell'app funzionano correttamente.",
  };
}
