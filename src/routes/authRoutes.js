import express from 'express';
import bcrypt from 'bcrypt';
import prisma from '../prisma.js';
import { signAccess, signRefresh, verifyRefresh } from '../utils/jwt.js';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const router = express.Router();
const COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'curalink_refresh';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000
};

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

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, phone, password, role, doctorData } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existing = await prisma.users.findUnique({ where: { email }});
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const user = await prisma.users.create({
      data: { 
        name, 
        email, 
        phone: phone || null, 
        role: role || 'patient' 
      }
    });

    const hash = await bcrypt.hash(password, 12);
    await prisma.$executeRaw`
      INSERT INTO credentials(user_id, password_hash) 
      VALUES (${user.id}::uuid, ${hash})
    `;

    if (user.role === 'patient') {
      await prisma.patients.create({
        data: { user_id: user.id }
      });
    } else if (user.role === 'doctor' && doctorData) {
      const doctor = await prisma.doctors.create({
        data: {
          user_id: user.id,
          specialties: doctorData.specialties || [],
          experience_years: doctorData.experience_years || 0,
          fee: doctorData.fee || 0,
          bio: doctorData.bio || '',
          languages: ['English'],
          verified: false,
          verification_status: 'pending'
        }
      });

      // Use createMany instead of individual creates (works better with pooler)
      try {
        await prisma.doctor_work_hours.createMany({
          data: [
            // Monday to Friday
            { doctor_id: doctor.id, weekday: 1, start_time: '09:00', end_time: '17:00' },
            { doctor_id: doctor.id, weekday: 2, start_time: '09:00', end_time: '17:00' },
            { doctor_id: doctor.id, weekday: 3, start_time: '09:00', end_time: '17:00' },
            { doctor_id: doctor.id, weekday: 4, start_time: '09:00', end_time: '17:00' },
            { doctor_id: doctor.id, weekday: 5, start_time: '09:00', end_time: '17:00' },
            // Saturday
            { doctor_id: doctor.id, weekday: 6, start_time: '09:00', end_time: '13:00' },
          ]
        });
        console.log(`✅ Created doctor with work hours: ${user.email}`);
      } catch (workHoursError) {
        console.error('❌ Failed to create work hours:', workHoursError.message);
        // Don't fail the registration, just log it
        console.log('⚠️ Doctor created but work hours need to be added manually');
      }
    }

    const access = signAccess({ userId: user.id, role: user.role });
    const refresh = signRefresh({ userId: user.id, role: user.role });

    res.cookie(COOKIE_NAME, refresh, COOKIE_OPTIONS);
    res.status(201).json({ 
      success: true,
      access, 
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const user = await prisma.users.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // ✅ CORRECT WAY (NO RAW SQL)
    const credential = await prisma.credentials.findUnique({
      where: { user_id: user.id }
    });

    if (!credential) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, credential.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const access = signAccess({ userId: user.id, role: user.role });
    const refresh = signRefresh({ userId: user.id, role: user.role });

    res.cookie(COOKIE_NAME, refresh, COOKIE_OPTIONS);
    res.json({
      success: true,
      access,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
        phone: user.phone
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/google
// POST /api/auth/google
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'Missing Google ID token' });
    }

    // ✅ Verify token securely
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, sub, picture } = payload;

    let user = await prisma.users.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.users.create({
        data: {
          name,
          email,
          auth_uid: sub,
          avatar_url: picture,
          role: 'patient'
        }
      });

      await prisma.patients.create({
        data: { user_id: user.id }
      });
    }

    const access = signAccess({ userId: user.id, role: user.role });
    const refresh = signRefresh({ userId: user.id, role: user.role });

    res.cookie(COOKIE_NAME, refresh, COOKIE_OPTIONS);
    res.json({ success: true, access, user });

  } catch (err) {
    console.error('Google Auth Error:', err.message);
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: 'No refresh token' });
    }
    
    const payload = verifyRefresh(token);
    const user = await prisma.users.findUnique({ where: { id: payload.userId }});
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const access = signAccess({ userId: user.id, role: user.role });
    res.json({ success: true, access, user });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
  res.json({ success: true, message: 'Logged out' });
});

export default router;
