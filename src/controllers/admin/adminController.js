import prisma from '../../prisma.js';

// GET /api/admin/doctors/pending
export async function getPendingDoctors(req, res, next) {
  try {
    const doctors = await prisma.doctors.findMany({
      where: { 
        verified: false,
        verification_status: 'pending'
      }
    });

    res.json({
      success: true,
      data: doctors
    });
  } catch (error) {
    next(error);
  }
}

// POST /api/admin/doctors/:id/verify
export async function verifyDoctor(req, res, next) {
  try {
    const { id } = req.params;
    const { approved, comments } = req.body;

    const doctor = await prisma.doctors.update({
      where: { id },
      data: {
        verified: approved,
        verification_status: approved ? 'approved' : 'rejected'
      }
    });

    // Update verification docs
    await prisma.verification_docs.updateMany({
      where: { doctor_id: id },
      data: {
        status: approved ? 'approved' : 'rejected',
        admin_comments: comments || null
      }
    });

    res.json({
      success: true,
      data: doctor,
      message: approved ? 'Doctor verified' : 'Doctor verification rejected'
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/stats
export async function getAdminStats(req, res, next) {
  try {
    const [
      totalUsers,
      totalDoctors,
      totalPatients,
      totalAppointments,
      pendingVerifications,
      completedAppointments,
      totalRevenue
    ] = await Promise.all([
      prisma.users.count(),
      prisma.doctors.count(),
      prisma.patients.count(),
      prisma.appointments.count(),
      prisma.doctors.count({ where: { verified: false } }),
      prisma.appointments.count({ where: { status: 'completed' } }),
      prisma.payments.aggregate({
        where: { status: 'completed' },
        _sum: { amount: true }
      })
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalDoctors,
        totalPatients,
        totalAppointments,
        pendingVerifications,
        completedAppointments,
        totalRevenue: totalRevenue._sum.amount || 0
      }
    });
  } catch (error) {
    next(error);
  }
}
