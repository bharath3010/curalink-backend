import express from 'express';
import bcrypt from 'bcrypt';
import prisma from '../prisma.js';
import { signAccess, signRefresh, verifyRefresh } from '../utils/jwt.js';
import { authLimiter } from '../middlewares/rateLimit.middleware.js';

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
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { name, email, phone, password, role, doctorData } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existing = await prisma.users.findUnique({ where: { email }});
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create user
    const user = await prisma.users.create({
      data: { 
        name, 
        email, 
        phone: phone || null, 
        role: role || 'patient' 
      }
    });

    // Hash password
    const hash = await bcrypt.hash(password, 12);
    await prisma.$executeRaw`
      INSERT INTO credentials(user_id, password_hash) 
      VALUES (${user.id}::uuid, ${hash})
    `;

    // Create profile based on role
    if (user.role === 'patient') {
      await prisma.patients.create({
        data: { user_id: user.id }
      });
    } else if (user.role === 'doctor' && doctorData) {
      // Create doctor profile
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

      // Automatically add work hours (Mon-Fri 9-5, Sat 9-1)
      for (let weekday = 1; weekday <= 5; weekday++) {
        await prisma.doctor_work_hours.create({
          data: {
            doctor_id: doctor.id,
            weekday,
            start_time: '09:00',
            end_time: '17:00'
          }
        });
      }

      // Saturday
      await prisma.doctor_work_hours.create({
        data: {
          doctor_id: doctor.id,
          weekday: 6,
          start_time: '09:00',
          end_time: '13:00'
        }
      });

      console.log(`✅ Created doctor profile with work hours for ${user.email}`);
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
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const user = await prisma.users.findUnique({ where: { email }});
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const rows = await prisma.$queryRaw`
      SELECT password_hash FROM credentials WHERE user_id = ${user.id} LIMIT 1
    `;
    const hashed = rows?.[0]?.password_hash;
    
    if (!hashed) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, hashed);
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
router.post('/google', async (req, res, next) => {
  try {
    const { idToken, role } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Missing idToken' });
    }

    const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const resp = await fetch(verifyUrl);
    
    if (!resp.ok) {
      return res.status(400).json({ error: 'Invalid Google token' });
    }
    
    const payload = await resp.json();
    if (!payload.email) {
      return res.status(400).json({ error: 'Google token missing email' });
    }

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
EOF# Update the register endpoint in authRoutes.js
cat > src/routes/authRoutes.js << 'EOF'
import express from 'express';
import bcrypt from 'bcrypt';
import prisma from '../prisma.js';
import { signAccess, signRefresh, verifyRefresh } from '../utils/jwt.js';
import { authLimiter } from '../middlewares/rateLimit.middleware.js';

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
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { name, email, phone, password, role, doctorData } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existing = await prisma.users.findUnique({ where: { email }});
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create user
    const user = await prisma.users.create({
      data: { 
        name, 
        email, 
        phone: phone || null, 
        role: role || 'patient' 
      }
    });

    // Hash password
    const hash = await bcrypt.hash(password, 12);
    await prisma.$executeRaw`
      INSERT INTO credentials(user_id, password_hash) 
      VALUES (${user.id}::uuid, ${hash})
    `;

    // Create profile based on role
    if (user.role === 'patient') {
      await prisma.patients.create({
        data: { user_id: user.id }
      });
    } else if (user.role === 'doctor' && doctorData) {
      // Create doctor profile
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

      // Automatically add work hours (Mon-Fri 9-5, Sat 9-1)
      for (let weekday = 1; weekday <= 5; weekday++) {
        await prisma.doctor_work_hours.create({
          data: {
            doctor_id: doctor.id,
            weekday,
            start_time: '09:00',
            end_time: '17:00'
          }
        });
      }

      // Saturday
      await prisma.doctor_work_hours.create({
        data: {
          doctor_id: doctor.id,
          weekday: 6,
          start_time: '09:00',
          end_time: '13:00'
        }
      });

      console.log(`✅ Created doctor profile with work hours for ${user.email}`);
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
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const user = await prisma.users.findUnique({ where: { email }});
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const rows = await prisma.$queryRaw`
      SELECT password_hash FROM credentials WHERE user_id = ${user.id} LIMIT 1
    `;
    const hashed = rows?.[0]?.password_hash;
    
    if (!hashed) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, hashed);
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
router.post('/google', async (req, res, next) => {
  try {
    const { idToken, role } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Missing idToken' });
    }

    const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const resp = await fetch(verifyUrl);
    
    if (!resp.ok) {
      return res.status(400).json({ error: 'Invalid Google token' });
    }
    
    const payload = await resp.json();
    if (!payload.email) {
      return res.status(400).json({ error: 'Google token missing email' });
    }

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
