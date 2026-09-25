// Table helpers shared by the Regia and the first-run setup.
import { db, q, transaction } from './db.js';

export const tableShape = (v) => (v === 'rect' ? 'rect' : 'round');
export const tableSeats = (v) => Math.max(0, Math.min(30, Math.round(Number(v) || 0)));
const isCouple = (t) => t.shape === 'rect' || /spos/i.test(t.name);

/** Numbered round tables ("Tavolo 1"…), optionally with the couple's long table first. */
export function createTables({ count = 0, prefix = 'Tavolo', seats = 8, couple = false } = {}) {
  const n = Math.max(0, Math.min(60, Math.round(Number(count) || 0)));
  const insert = db.prepare('INSERT INTO seating_tables(name, sort, shape, seats) VALUES(?, ?, ?, ?)');
  transaction(() => {
    if (couple && !q.allTables.all().some(isCouple)) {
      db.prepare('UPDATE seating_tables SET sort = sort + 1').run();
      insert.run('Sposi', 0, 'rect', 2);
    }
    const names = new Set(q.allTables.all().map((t) => t.name.toLowerCase()));
    let sort = db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM seating_tables').get().n;
    for (let i = 1, made = 0; made < n; i++) {
      const name = `${prefix} ${i}`;
      if (names.has(name.toLowerCase())) continue;
      insert.run(name, sort++, 'round', tableSeats(seats));
      made++;
    }
  });
}

/** Couple's table at the top centre, everyone else in rows below it. */
export function arrangeTables() {
  const all = q.allTables.all();
  const couple = all.filter(isCouple);
  const others = all.filter((t) => !isCouple(t));
  const set = db.prepare('UPDATE seating_tables SET x = ?, y = ? WHERE id = ?');
  const r1 = (v) => Math.round(v * 10) / 10;
  transaction(() => {
    couple.forEach((t, i) => set.run(r1(50 + (i - (couple.length - 1) / 2) * 22), 13, t.id));
    const cols = others.length <= 4 ? Math.max(1, others.length) : Math.ceil(Math.sqrt(others.length * 2));
    const rows = Math.max(1, Math.ceil(others.length / cols));
    others.forEach((t, i) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, others.length - row * cols);
      const x = 12 + (((i % cols) + 0.5) * 76) / cols + ((cols - inRow) * 76) / cols / 2;
      const y = rows === 1 ? 55 : 35 + (row * 48) / (rows - 1);
      set.run(r1(x), r1(y), t.id);
    });
  });
}
