import { createApp, adminPassword } from './app.js';
import { initPush } from './push.js';
import { startWorker } from './worker.js';
import { DATA_DIR } from './db.js';
import { applySeed } from './seed.js';
import { applyQuizSeed } from './quiz.js';

initPush();
await applySeed();
applyQuizSeed();
startWorker();

const port = Number(process.env.PORT) || 3000;
createApp().listen(port, () => {
  console.log(`💍 App del matrimonio avviata sulla porta ${port} (dati in ${DATA_DIR})`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn(`⚠️  ADMIN_PASSWORD non impostata: password amministratore temporanea = ${adminPassword()}`);
  }
});
