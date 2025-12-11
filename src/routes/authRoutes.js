import express from 'express';
import bcrypt from 'bcrypt';
import prisma from '../prisma.js';
import { signAccess, signRefresh, verifyRefresh } from '../utils/jwt.js';
import { authLimiter } from '../middlewares/rateLimit.middleware.js';
import { validateBody, schemas } from '../middlewares/validation.middleware.js';

const router = express.Router();
const COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'curalink_refresh';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000
};

// Helper: Create or find user
async function findOrCreateUser({ name, email, phone, role = 'patient', auth_uid = null }) {
  let user = await prisma.users.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.users.create({
      data: { name: name || email.split('@')[0], email, phone: phone || null, role, auth_uid }
    });

    if (role === 'patient') {
      await prisma.patients.create({
        data: { user_id: user.id }
      });
    }
  }

  return user;
}

// REGISTER
router.post('/register', authLimiter, validateBody(schemas.register), async (req, res, next) => {
  try {
    const { name, email, phone, password, role } = req.body;

    const existing = await prisma.users.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const user = await prisma.users.create({
      data: { name, email, phone: phone || null, role: role || 'patient' }
    });

    const hash = await bcrypt.hash(password, 12);

    await prisma.$executeRaw`
      INSERT INTO credentials (user_id, password_hash)
      VALUES (${user.id}::uuid, ${hash})
    `;

    if (user.role === 'patient') {
      await prisma.patients.create({
        data: { user_id: user.id }
      });
    }

    const access = signAccess({ userId: user.id, role: user.role });
    const refresh = signRefresh({ userId: user.id, role: user.role });

    res.cookie(COOKIE_NAME, refresh, COOKIE_OPTIONS);
    res.status(201).json({ success: true, access, user });

  } catch (err) {
    next(err);
  }
});

// LOGIN
router.post('/login', authLimiter, validateBody(schemas.login), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.users.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const rows = await prisma.$queryRaw`
      SELECT password_hash FROM credentials WHERE user_id = ${user.id} LIMIT 1
    `;
    const hashed = rows?.[0]?.password_hash;

    if (!hashed) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, hashed);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const access = signAccess({ userId: user.id, role: user.role });
    const refresh = signRefresh({ userId: user.id, role: user.role });

    res.cookie(COOKIE_NAME, refresh, COOKIE_OPTIONS);
    res.json({ success: true, access, user });

  } catch (err) {
    next(err);
  }
});

// GOOGLE LOGIN
router.post('/google', async (req, res, next) => {
  try {
    const { idToken, role } = req.body;

    if (!idToken) return res.status(400).json({ error: 'Missing Google idToken' });

    const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const resp = await fetch(verifyUrl);
    if (!resp.ok) return res.status(400).json({ error: 'Invalid Google token' });

    const payload = await resp.json();
    if (!payload.email) return res.status(400).json({ error: 'Google token missing email' });

    const user = await findOrCreateUser({
      name: payload.name,
      email: payload.email,
      phone: null,
      role: role || 'patient',
      auth_uid: payload.sub
    });

    const access = signAccess({ userId: user.id, role: user.role });
    const refresh = signRefresh({ userId: user.id, role: user.role });

    res.cookie(COOKIE_NAME, refresh, COOKIE_OPTIONS);
    res.json({ success: true, access, user });

  } catch (err) {
    next(err);
  }
});

// REFRESH TOKEN
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Missing refresh token' });

    const payload = verifyRefresh(token);
    const user = await prisma.users.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ error: 'User no longer exists' });

    const access = signAccess({ userId: user.id, role: user.role });
    res.json({ success: true, access, user });

  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// LOGOUT
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
  res.json({ success: true, message: 'Logged out' });
});

export default router;
