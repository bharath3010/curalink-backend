import express from 'express';
import prisma from '../prisma.js';
import requireAuth from '../middlewares/auth.js';
const router = express.Router();

// POST /api/appointments
// body: { doctorId, patientId, appointmentStart (ISO string), durationMinutes, reason }
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { doctorId, patientId, appointmentStart, durationMinutes = 30, reason } = req.body;

    // Basic validation
    if (!doctorId || !patientId || !appointmentStart) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Use the DB atomic function created earlier
    // Note: prisma.$queryRaw returns raw result rows; cast appropriately
    const rows = await prisma.$queryRaw`
      SELECT create_appointment_atomic(
        ${doctorId}::uuid,
        ${patientId}::uuid,
        ${new Date(appointmentStart).toISOString()}::timestamptz,
        ${Number(durationMinutes)}::int,
        ${reason}::text
      ) as id
    `;

    const createdId = rows?.[0]?.id;
    if (!createdId) {
      return res.status(500).json({ error: 'Booking failed' });
    }

    // Fetch appointment details
    const appointment = await prisma.appointments.findUnique({ where: { id: createdId }});
    return res.status(201).json({ ok: true, appointment });
  } catch (err) {
    // If DB function raised error like 'Slot already booked', it comes here
    return next(err);
  }
});

// GET /api/appointments/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = req.params.id;
    const appt = await prisma.appointments.findUnique({ where: { id }});
    if (!appt) return res.status(404).json({ error: 'Not found' });
    res.json({ appt });
  } catch (err) { next(err); }
});

export default router;
