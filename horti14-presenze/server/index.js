import { createApp } from './app.js';
import { bootstrapAdmin } from './auth.js';
import { initPush } from './push.js';
import { startWorker } from './worker.js';
import { DATA_DIR } from './db.js';

initPush();
bootstrapAdmin();
startWorker();

const port = Number(process.env.PORT) || 3000;
createApp().listen(port, () => {
  console.log(`🌿 Presenze avviate sulla porta ${port} (dati in ${DATA_DIR})`);
});
