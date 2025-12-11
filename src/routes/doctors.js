import express from 'express';
import prisma from '../prisma.js';
const router = express.Router();

// GET /api/doctors?search=&specialty=&page=1&limit=12
router.get('/', async (req, res, next) => {
  try {
    const { search, specialty, page = 1, limit = 12 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {};
    if (search) {
      where.OR = [
        { bio: { contains: search, mode: 'insensitive' } },
        { languages: { has: search } }
      ];
    }
    if (specialty) {
      where.specialties = { has: specialty };
    }

    const doctors = await prisma.doctors.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { rating: 'desc' }
    });

    res.json({ data: doctors });
  } catch (err) { next(err); }
});

// GET /api/doctors/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const doctor = await prisma.doctors.findUnique({ where: { id }});
    if (!doctor) return res.status(404).json({ error: 'Not found' });
    res.json({ data: doctor });
  } catch (err) { next(err); }
});

export default router;
