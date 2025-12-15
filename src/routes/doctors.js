import express from 'express';
import prisma from '../prisma.js';
import requireAuth from '../middlewares/auth.js';

const router = express.Router();

// GET /api/doctors/meta/specialties - MUST BE BEFORE /:id route
router.get('/meta/specialties', async (req, res, next) => {
  try {
    const doctors = await prisma.doctors.findMany({
      select: { specialties: true }
    });

    const specialtiesSet = new Set();
    doctors.forEach(doc => {
      doc.specialties?.forEach(spec => specialtiesSet.add(spec));
    });

    const specialties = Array.from(specialtiesSet).sort();

    res.json({
      success: true,
      data: specialties
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/doctors - Advanced filtering & search
router.get('/', async (req, res, next) => {
  try {
    const {
      search,
      specialty,
      minFee,
      maxFee,
      minRating,
      language,
      gender,
      verified,
      sortBy = 'rating',
      order = 'desc',
      page = 1,
      limit = 12
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {};

    if (search) {
      where.OR = [
        { bio: { contains: search, mode: 'insensitive' } },
        { specialties: { has: search } }
      ];
    }

    if (specialty) {
      where.specialties = { has: specialty };
    }

    if (minFee || maxFee) {
      where.fee = {};
      if (minFee) where.fee.gte = Number(minFee);
      if (maxFee) where.fee.lte = Number(maxFee);
    }

    if (minRating) {
      where.rating = { gte: Number(minRating) };
    }

    if (language) {
      where.languages = { has: language };
    }

    if (gender) {
      where.gender = gender;
    }

    if (verified === 'true') {
      where.verified = true;
    }

    const orderBy = {};
    if (sortBy === 'rating') {
      orderBy.rating = order;
    } else if (sortBy === 'fee') {
      orderBy.fee = order;
    } else if (sortBy === 'experience') {
      orderBy.experience_years = order;
    } else {
      orderBy.rating = 'desc';
    }

    const [doctors, total] = await Promise.all([
      prisma.doctors.findMany({
        where,
        skip,
        take,
        orderBy
      }),
      prisma.doctors.count({ where })
    ]);

    res.json({
      success: true,
      data: doctors,
      pagination: {
        page: Number(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take)
      },
      filters: {
        search, specialty, minFee, maxFee, minRating, language, gender, verified
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/doctors/:id - Doctor profile with reviews
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const doctor = await prisma.doctors.findUnique({
      where: { id }
    });

    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const user = await prisma.users.findUnique({
      where: { id: doctor.user_id }
    });

    const workHours = await prisma.doctor_work_hours.findMany({
      where: { doctor_id: id },
      orderBy: { weekday: 'asc' }
    });

    const reviews = await prisma.reviews.findMany({
      where: { doctor_id: id },
      orderBy: { created_at: 'desc' },
      take: 10
    });

    let verificationDocs = [];
    if (req.user && req.user.role === 'admin') {
      verificationDocs = await prisma.verification_docs.findMany({
        where: { doctor_id: id }
      });
    }

    res.json({
      success: true,
      data: {
        ...doctor,
        user: {
          name: user.name,
          email: user.email,
          avatar_url: user.avatar_url
        },
        workHours,
        reviews: {
          data: reviews,
          count: reviews.length,
          averageRating: doctor.rating
        },
        ...(verificationDocs.length > 0 && { verificationDocs })
      }
    });
  } catch (err) {
    next(err);
  }
});


// GET /api/doctors/:id/availability
router.get('/:id/availability', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date parameter required' });
    }

    // Normalize date (avoid TZ shift)
    const targetDate = new Date(`${date}T00:00:00`);
    const weekday = targetDate.getDay(); // 0 = Sunday

    const workHours = await prisma.doctor_work_hours.findMany({
      where: { doctor_id: id, weekday }
    });

    if (workHours.length === 0) {
      return res.json({
        success: true,
        available: false,
        slots: []
      });
    }

    const startOfDay = new Date(`${date}T00:00:00`);
    const endOfDay = new Date(`${date}T23:59:59`);

    const bookedSlots = await prisma.appointments.findMany({
      where: {
        doctor_id: id,
        appointment_start: {
          gte: startOfDay,
          lte: endOfDay
        },
        status: { not: 'cancelled' }
      },
      select: {
        appointment_start: true,
        duration_minutes: true
      }
    });

    const bookedTimes = bookedSlots.map(b =>
      b.appointment_start.getTime()
    );

    const availableSlots = [];

    for (const wh of workHours) {
      // ✅ Extract hours/minutes from DateTime (@db.Time)
      const startH = wh.start_time.getUTCHours();
      const startM = wh.start_time.getUTCMinutes();
      const endH = wh.end_time.getUTCHours();
      const endM = wh.end_time.getUTCMinutes();

      let current = new Date(`${date}T${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00`);
      const end = new Date(`${date}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`);

      while (current < end) {
        const time = current.getTime();

        if (!bookedTimes.includes(time)) {
          availableSlots.push(new Date(time).toISOString());
        }

        current = new Date(time + 30 * 60 * 1000); // 30 mins
      }
    }

    res.json({
      success: true,
      available: true,
      slots: availableSlots
    });
  } catch (err) {
    next(err);
  }
});


export default router;
