import prisma from '../../prisma.js';

// POST /api/reviews
export async function createReview(req, res, next) {
  try {
    const { appointmentId, overallRating, bedside, waitTime, staffFriendliness, comment, anonymous } = req.body;
    const userId = req.user.userId;

    // Get appointment
    const appointment = await prisma.appointments.findUnique({
      where: { id: appointmentId }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appointment.status !== 'completed') {
      return res.status(400).json({ error: 'Can only review completed appointments' });
    }

    // Check if already reviewed
    const existing = await prisma.reviews.findFirst({
      where: { appointment_id: appointmentId }
    });

    if (existing) {
      return res.status(400).json({ error: 'Already reviewed' });
    }

    // Get patient ID
    const patient = await prisma.patients.findFirst({
      where: { user_id: userId }
    });

    // Create review
    const review = await prisma.reviews.create({
      data: {
        appointment_id: appointmentId,
        doctor_id: appointment.doctor_id,
        patient_id: patient?.id,
        overall_rating: overallRating,
        bedside,
        wait_time: waitTime,
        staff_friendliness: staffFriendliness,
        comment,
        anonymous: anonymous || false
      }
    });

    // Update doctor's average rating
    const allReviews = await prisma.reviews.findMany({
      where: { doctor_id: appointment.doctor_id }
    });

    const avgRating = allReviews.reduce((sum, r) => sum + (r.overall_rating || 0), 0) / allReviews.length;

    await prisma.doctors.update({
      where: { id: appointment.doctor_id },
      data: {
        rating: avgRating,
        reviews_count: allReviews.length
      }
    });

    res.status(201).json({
      success: true,
      data: review
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/reviews/doctor/:doctorId
export async function getDoctorReviews(req, res, next) {
  try {
    const { doctorId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const [reviews, total] = await Promise.all([
      prisma.reviews.findMany({
        where: { doctor_id: doctorId },
        skip,
        take: Number(limit),
        orderBy: { created_at: 'desc' }
      }),
      prisma.reviews.count({ where: { doctor_id: doctorId } })
    ]);

    res.json({
      success: true,
      data: reviews,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    next(error);
  }
}
