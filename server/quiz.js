// "Il gioco degli sposi": a quiz about the couple in every guest's profile.
// Everyone who finishes gets a trophy; answering everything right earns the shiny one,
// and the first few to do so (quiz.prizes) win a prize from the couple.
// Correct answers never leave the server until the guest has answered that question.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, q, getSettings, setSettings, cleanText } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

/** Guests with the shiny trophy, first to finish first: the first `prizes` of them win. */
const championRows = () =>
  db.prepare("SELECT id, name, quiz_done_at FROM guests WHERE trophy = 'shiny' ORDER BY quiz_done_at, id LIMIT 50").all();

const placeOf = (g) => {
  const i = championRows().findIndex((r) => r.id === g.id);
  return i < 0 ? null : i + 1;
};

const signature = (quiz) =>
  JSON.stringify((quiz?.questions || []).map((item) => [item.text, item.options, item.answer]));

/** Saving different questions restarts the games in progress; finished trophies stay. */
export function onQuizSaved(before, after) {
  if (signature(before) !== signature(after)) {
    db.prepare('UPDATE guests SET quiz_answers = NULL WHERE quiz_done_at IS NULL').run();
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
  return { answered, score: g.quiz_score ?? 0, done: !!g.quiz_done_at, place: g.trophy === 'shiny' ? placeOf(g) : null };
}

export function registerQuizRoutes(app, { meJson }) {
  const active = () => {
    const quiz = getSettings().quiz;
    return quiz?.enabled && quiz.questions?.length ? quiz : null;
  };

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
      questions: quiz.questions.map((item, i) => ({
        emoji: item.emoji,
        text: item.text,
        options: item.options,
        ...(answers[i] !== null ? { chosen: answers[i], answer: item.answer, fact: item.fact } : {}),
      })),
      score: g.quiz_score ?? 0,
      done: !!g.quiz_done_at,
      trophy: g.trophy || null,
      place: g.trophy === 'shiny' ? placeOf(g) : null,
      champions: championRows().map((r) => r.name),
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
    db.prepare('UPDATE guests SET quiz_answers = ?, quiz_score = ?, quiz_done_at = ?, trophy = ? WHERE id = ?').run(
      JSON.stringify(answers),
      score,
      done ? Date.now() : null,
      trophy,
      g.id,
    );
    res.json({
      correct: choice === item.answer,
      answer: item.answer,
      fact: item.fact,
      score,
      done,
      trophy,
      place: trophy === 'shiny' ? placeOf(g) : null,
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
    // Who to hand the prizes to, in order.
    winners: championRows()
      .slice(0, getSettings().quiz?.prizes || 0)
      .map((r) => ({ name: r.name, at: r.quiz_done_at })),
  };
}

export function resetQuizResults() {
  db.prepare('UPDATE guests SET quiz_answers = NULL, quiz_score = NULL, quiz_done_at = NULL, trophy = NULL').run();
}
