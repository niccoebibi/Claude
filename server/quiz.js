// "Il gioco degli sposi": a quiz about the couple in every guest's profile.
// Everyone who finishes gets a trophy; answering everything right earns the shiny one.
// The leaderboard ranks by right answers, then by time spent playing: the top few
// (quiz.prizes) win a prize if nobody overtakes them before the couple closes it
// at the bouquet toss.
// The right answers never leave the server, so guests cannot pass them around:
// a guest only learns whether each of their own answers was right.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, q, getSettings, setSettings, cleanText } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Time counts from "Inizia" to the last answer; a long pause counts as three minutes at most,
// so nobody is penalised for putting the phone away and finishing another day.
const MAX_STEP_MS = 3 * 60 * 1000;
// Special celebrations a right answer can trigger (public/js/effects.js).
const EFFECTS = ['drago', 'anelli', 'ballo', 'mare', 'borsa', 'fulmine', 'brindisi', 'viaggio', 'macellaio', 'trattore', 'campanello', 'medaglie', 'gattina', 'racchetta', 'sveglia', 'auto', 'aeroplanini'];

export function sanitizeQuiz(v) {
  if (!v || typeof v !== 'object') return null;
  const questions = (Array.isArray(v.questions) ? v.questions : [])
    .slice(0, 40)
    .map((item) => {
      // Empty options are dropped; the right answer follows its option.
      const kept = (Array.isArray(item?.options) ? item.options : [])
        .map((o, i) => ({ text: cleanText(o, 120), i }))
        .filter((o) => o.text)
        .slice(0, 6);
      const answer = kept.findIndex((o) => o.i === Math.round(Number(item?.answer)));
      return {
        emoji: cleanText(item?.emoji, 16),
        text: cleanText(item?.text, 300),
        options: kept.map((o) => o.text),
        answer: Math.max(0, answer),
        fact: cleanText(item?.fact, 400),
        effect: EFFECTS.includes(item?.effect) ? item.effect : '',
        // Words shown inside the effect (a name on an apron, a banner): kept with the questions.
        effectLabel: cleanText(item?.effectLabel, 24),
      };
    })
    .filter((item) => item.text && item.options.length >= 2);
  return {
    enabled: v.enabled !== false,
    title: cleanText(v.title, 120) || 'Quanto conosci gli sposi?',
    intro: cleanText(v.intro, 600),
    prizes: Math.max(0, Math.min(10, Math.round(Number(v.prizes) || 0))),
    questions,
  };
}

/** The leaderboard: most right answers first, then the quickest. Frozen once closed. */
export function ranking() {
  const closedAt = getSettings().quizClosedAt;
  return db
    .prepare(
      `SELECT id, name, quiz_score AS score, quiz_time_ms AS time, quiz_done_at AS at, trophy FROM guests
       WHERE quiz_done_at IS NOT NULL ${closedAt ? 'AND quiz_done_at <= ?' : ''}
       ORDER BY quiz_score DESC, COALESCE(quiz_time_ms, 9e15), quiz_done_at, id`,
    )
    .all(...(closedAt ? [closedAt] : []));
}

const placeOf = (g) => {
  const i = ranking().findIndex((r) => r.id === g.id);
  return i < 0 ? null : i + 1;
};

const signature = (quiz) =>
  JSON.stringify((quiz?.questions || []).map((item) => [item.text, item.options, item.answer]));

/** Saving different questions restarts the games in progress; finished trophies stay. */
export function onQuizSaved(before, after) {
  if (signature(before) !== signature(after)) {
    db.prepare('UPDATE guests SET quiz_answers = NULL, quiz_time_ms = NULL, quiz_last_at = NULL WHERE quiz_done_at IS NULL').run();
  }
}

/** Questions from config/quiz.json, loaded once (kept out of the public repository). */
export function applyQuizSeed() {
  const file = process.env.QUIZ_FILE || path.join(ROOT, 'config', 'quiz.json');
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'quiz'").get() || !fs.existsSync(file)) return;
  try {
    const quiz = sanitizeQuiz(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (quiz?.questions.length) {
      setSettings({ quiz });
      console.log(`🏆 Gioco degli sposi caricato (${quiz.questions.length} domande)`);
    }
  } catch (err) {
    console.warn('[gioco] config/quiz.json non valido:', err.message);
  }
}

function answersOf(g, total) {
  let list = [];
  try {
    list = JSON.parse(g.quiz_answers || '[]');
  } catch {
    /* start over */
  }
  return Array.from({ length: total }, (_, i) => (Number.isInteger(list[i]) ? list[i] : null));
}

/** The guest's own progress, for the profile and the top bar. */
export function quizMe(g) {
  const quiz = getSettings().quiz;
  const total = quiz?.questions?.length || 0;
  const answered = g.quiz_done_at ? total : answersOf(g, total).filter((a) => a !== null).length;
  return { answered, score: g.quiz_score ?? 0, done: !!g.quiz_done_at, place: g.quiz_done_at ? placeOf(g) : null, time: g.quiz_time_ms ?? null };
}

export function registerQuizRoutes(app, { meJson }) {
  const active = () => {
    const quiz = getSettings().quiz;
    return quiz?.enabled && quiz.questions?.length ? quiz : null;
  };

  // "Inizia il gioco": the clock starts.
  app.post('/api/quiz/start', (req, res) => {
    if (!active()) return res.status(404).json({ error: 'Il gioco non è disponibile' });
    if (!req.guest) return res.status(401).json({ error: 'Registrati per giocare' });
    db.prepare(
      'UPDATE guests SET quiz_last_at = ?, quiz_time_ms = 0 WHERE id = ? AND quiz_done_at IS NULL AND quiz_last_at IS NULL',
    ).run(Date.now(), req.guest.id);
    res.json({ ok: true });
  });

  app.get('/api/quiz', (req, res) => {
    const quiz = active();
    if (!quiz) return res.status(404).json({ error: 'Il gioco non è disponibile' });
    if (!req.guest) return res.status(401).json({ error: 'Registrati per giocare' });
    const g = q.guestById.get(req.guest.id);
    const answers = answersOf(g, quiz.questions.length);
    res.json({
      title: quiz.title,
      intro: quiz.intro,
      prizes: quiz.prizes || 0,
      closed: !!getSettings().quizClosedAt,
      questions: quiz.questions.map((item, i) => ({
        emoji: item.emoji,
        text: item.text,
        options: item.options,
        effect: item.effect || '',
        effectLabel: item.effectLabel || '',
        ...(answers[i] !== null
          ? { chosen: answers[i], correct: answers[i] === item.answer, fact: answers[i] === item.answer ? item.fact : '' }
          : {}),
      })),
      score: g.quiz_score ?? 0,
      done: !!g.quiz_done_at,
      time: g.quiz_time_ms ?? null,
      trophy: g.trophy || null,
      place: g.quiz_done_at ? placeOf(g) : null,
      leaderboard: ranking()
        .slice(0, 10)
        .map((r) => ({ name: r.name, score: r.score, time: r.time, shiny: r.trophy === 'shiny', me: r.id === g.id })),
      players: db.prepare('SELECT COUNT(*) AS n FROM guests WHERE quiz_done_at IS NOT NULL').get().n,
    });
  });

  app.post('/api/quiz/answer', (req, res) => {
    const quiz = active();
    if (!quiz) return res.status(404).json({ error: 'Il gioco non è disponibile' });
    if (!req.guest) return res.status(401).json({ error: 'Registrati per giocare' });
    const g = q.guestById.get(req.guest.id);
    if (g.quiz_done_at) return res.status(409).json({ error: 'Hai già finito il gioco' });
    const total = quiz.questions.length;
    const index = Number(req.body?.index);
    const choice = Number(req.body?.choice);
    const item = Number.isInteger(index) ? quiz.questions[index] : null;
    if (!item || !Number.isInteger(choice) || choice < 0 || choice >= item.options.length) {
      return res.status(400).json({ error: 'Risposta non valida' });
    }
    const answers = answersOf(g, total);
    if (answers[index] !== null) return res.status(409).json({ error: 'Hai già risposto a questa domanda' });
    answers[index] = choice;

    const score = answers.filter((a, i) => a === quiz.questions[i].answer).length;
    const done = answers.every((a) => a !== null);
    const trophy = done ? (score === total ? 'shiny' : 'classic') : null;
    const now = Date.now();
    const time = (g.quiz_time_ms ?? 0) + (g.quiz_last_at ? Math.min(now - g.quiz_last_at, MAX_STEP_MS) : 0);
    db.prepare(
      'UPDATE guests SET quiz_answers = ?, quiz_score = ?, quiz_done_at = ?, trophy = ?, quiz_time_ms = ?, quiz_last_at = ? WHERE id = ?',
    ).run(JSON.stringify(answers), score, done ? now : null, trophy, time, now, g.id);
    res.json({
      correct: choice === item.answer,
      // The curiosity often gives the answer away: only for who got it right.
      fact: choice === item.answer ? item.fact : '',
      score,
      done,
      trophy,
      place: done ? placeOf(g) : null,
      me: meJson(q.guestById.get(g.id)),
    });
  });
}

export function quizStats() {
  const n = (sql) => db.prepare(sql).get().n;
  return {
    playing: n('SELECT COUNT(*) AS n FROM guests WHERE quiz_answers IS NOT NULL AND quiz_done_at IS NULL'),
    finished: n('SELECT COUNT(*) AS n FROM guests WHERE quiz_done_at IS NOT NULL'),
    shiny: n("SELECT COUNT(*) AS n FROM guests WHERE trophy = 'shiny'"),
    prizes: getSettings().quiz?.prizes || 0,
    closedAt: getSettings().quizClosedAt,
    // Who to hand the prizes to, in order (final once the leaderboard is closed).
    winners: ranking()
      .slice(0, getSettings().quiz?.prizes || 0)
      .map((r) => ({ name: r.name, score: r.score, time: r.time, at: r.at })),
  };
}

export function resetQuizResults() {
  db.prepare(
    'UPDATE guests SET quiz_answers = NULL, quiz_score = NULL, quiz_done_at = NULL, trophy = NULL, quiz_time_ms = NULL, quiz_last_at = NULL',
  ).run();
  setSettings({ quizClosedAt: null });
}

/** The bouquet toss: freeze (or reopen) the leaderboard. */
export function closeQuiz(closed) {
  setSettings({ quizClosedAt: closed ? Date.now() : null });
}
