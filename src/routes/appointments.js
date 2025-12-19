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

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let appointments = [];

    if (userRole === 'patient') {
      const patient = await prisma.patients.findFirst({
        where: { user_id: userId },
      });

      if (!patient) {
        return res.json({ success: true, data: [] });
      }

      appointments = await prisma.appointments.findMany({
        where: { patient_id: patient.id },
        orderBy: { appointment_start: 'desc' },
        include: {
          doctor: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                  avatar_url: true,
                },
              },
            },
          },
          payment: true,
        },
      });
    }

    else if (userRole === 'doctor') {
      const doctor = await prisma.doctors.findFirst({
        where: { user_id: userId },
      });

      if (!doctor) {
        return res.json({ success: true, data: [] });
      }

      appointments = await prisma.appointments.findMany({
        where: { doctor_id: doctor.id },
        orderBy: { appointment_start: 'desc' },
        include: {
          patient: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                  avatar_url: true,
                },
              },
            },
          },
          payment: true,
        },
      });
    }

    else {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({ success: true, data: appointments });
  } catch (error) {
    console.error('❌ Appointments fetch error:', error);
    next(error);
  }
});

export default router;