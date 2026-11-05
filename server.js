import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './server/db.js';
import { createApp } from './server/app.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'data', 'barbearia.db');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const db = openDatabase(DB_FILE);
const app = createApp(db);

const server = app.listen(PORT, HOST, () => {
  console.log(`💈 Gestão Financeira da Barbearia rodando em http://localhost:${PORT}`);
  console.log(`   Banco de dados: ${DB_FILE}`);
});

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
