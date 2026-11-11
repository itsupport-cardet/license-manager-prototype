import express from 'express';
import cookieSession from 'cookie-session';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DB, ROOT } from './db.js';
import { seedIfEmpty } from './seed.js';
import { authRoutes, requireAuth } from './routes/auth.js';
import { subscriptionRoutes } from './routes/subscriptions.js';
import { peopleRoutes } from './routes/people.js';
import { transactionRoutes } from './routes/transactions.js';
import { lookupRoutes } from './routes/lookups.js';
import { reportRoutes } from './routes/reports.js';

const PORT = Number(process.env.PORT) || 3001;
const db = new DB();
if (seedIfEmpty(db)) console.log('Database was empty: loaded demo data from seed/data.json');

const app = express();
app.set('trust proxy', 1); // Render terminates TLS in front of the app
app.use(express.json({ limit: '2mb' }));
app.use(cookieSession({
  name: 'lm_session',
  // Render sets SESSION_SECRET. Locally use a fixed dev secret so `node --watch` restarts don't log everyone out.
  secret: process.env.SESSION_SECRET
    || (process.env.NODE_ENV === 'production' ? crypto.randomBytes(32).toString('hex') : 'local-dev-secret-not-for-production'),
  maxAge: 12 * 60 * 60 * 1000,
  sameSite: 'lax',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
}));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const api = express.Router();
api.use('/auth', authRoutes());
api.use(requireAuth);
api.use('/subscriptions', subscriptionRoutes(db));
api.use('/people', peopleRoutes(db));
api.use('/transactions', transactionRoutes(db));
api.use('/lookups', lookupRoutes(db));
api.use('/', reportRoutes(db));
api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/api', api);

// Serve the built React app (npm run build -> dist/)
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// Errors: zod validation -> 400, sqlite constraint -> 409, others -> 500
app.use((err, _req, res, _next) => {
  if (err?.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation failed', details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
  }
  if (/constraint/i.test(err?.message || '')) return res.status(409).json({ error: err.message });
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Server error' });
});

app.listen(PORT, () => console.log(`License Manager API on http://localhost:${PORT}`));
