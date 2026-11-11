import { Router } from 'express';
import crypto from 'node:crypto';

// Prototype auth: one shared demo account from env vars. The "name" typed at login
// is only used to attribute changes in the activity log.
const USER = () => process.env.DEMO_USER || 'demo';
const PASS = () => process.env.DEMO_PASSWORD || 'demo';

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function authRoutes() {
  const r = Router();
  r.get('/me', (req, res) => {
    if (!req.session?.user) return res.status(401).json({ error: 'Not logged in' });
    res.json(req.session.user);
  });
  r.post('/login', (req, res) => {
    const { username = '', password = '', name = '' } = req.body || {};
    if (!safeEqual(username.trim(), USER()) || !safeEqual(password, PASS())) {
      return res.status(401).json({ error: 'Wrong username or password' });
    }
    req.session.user = { username: USER(), name: String(name).trim().slice(0, 60) || 'Demo user' };
    res.json(req.session.user);
  });
  r.post('/logout', (req, res) => { req.session = null; res.json({ ok: true }); });
  return r;
}

export function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Not logged in' });
  req.actor = req.session.user.name;
  next();
}
