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

    const targetDate = new Date(date);
    const weekday = targetDate.getDay();

    const workHours = await prisma.doctor_work_hours.findMany({
      where: {
        doctor_id: id,
        weekday
      }
    });

    if (workHours.length === 0) {
      return res.json({
        success: true,
        available: false,
        message: 'Doctor not available on this day'
      });
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const bookedSlots = await prisma.appointments.findMany({
      where: {
        doctor_id: id,
        appointment_start: {
          gte: startOfDay,
          lte: endOfDay
        },
        status: {
          not: 'cancelled'
        }
      },
      select: {
        appointment_start: true,
        duration_minutes: true
      }
    });

    const availableSlots = [];
    workHours.forEach(wh => {
      const [startHour, startMin] = wh.start_time.split(':').map(Number);
      const [endHour, endMin] = wh.end_time.split(':').map(Number);

      let currentTime = new Date(date);
      currentTime.setHours(startHour, startMin, 0, 0);

      const endTime = new Date(date);
      endTime.setHours(endHour, endMin, 0, 0);

      while (currentTime < endTime) {
        const slotTime = new Date(currentTime);
        
        const isBooked = bookedSlots.some(slot => {
          const slotStart = new Date(slot.appointment_start);
          const slotEnd = new Date(slotStart.getTime() + slot.duration_minutes * 60000);
          return slotTime >= slotStart && slotTime < slotEnd;
        });

        if (!isBooked) {
          availableSlots.push({
            time: slotTime.toISOString(),
            displayTime: slotTime.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: true 
            })
          });
        }

        currentTime.setMinutes(currentTime.getMinutes() + 30);
      }
    });

    res.json({
      success: true,
      available: availableSlots.length > 0,
      date,
      workHours,
      availableSlots
    });
  } catch (err) {
    next(err);
  }
});

export default router;
