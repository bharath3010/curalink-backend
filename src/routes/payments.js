import express from 'express';
import requireAuth from '../middlewares/auth.js';
import paymentService from '../services/payment.service.js';
import prisma from '../prisma.js';

const router = express.Router();

// POST /api/payments/create-order
router.post('/create-order', requireAuth, async (req, res, next) => {
  try {
    const { appointmentId } = req.body;
    
    if (!appointmentId) {
      return res.status(400).json({ error: 'appointmentId required' });
    }

    const appointment = await prisma.appointments.findUnique({
      where: { id: appointmentId }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const doctor = await prisma.doctors.findUnique({
      where: { id: appointment.doctor_id }
    });

    const amount = doctor.fee;
    const paypalOrder = await paymentService.createOrder(appointmentId, amount);

    // Create payment record
    const payment = await prisma.payments.create({
      data: {
        appointment_id: appointmentId,
        amount,
        platform_fee: Math.round(amount * 0.05),
        provider: 'paypal',
        provider_payment_id: paypalOrder.orderId,
        status: 'pending'
      }
    });

    res.json({
      success: true,
      orderId: paypalOrder.orderId,
      paymentId: payment.id,
      amount,
      links: paypalOrder.links
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/payments/capture-order
router.post('/capture-order', requireAuth, async (req, res, next) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId required' });
    }

    const captureData = await paymentService.captureOrder(orderId);

    const payment = await prisma.payments.findFirst({
      where: { provider_payment_id: orderId }
    });

    if (payment) {
      await prisma.payments.update({
        where: { id: payment.id },
        data: { status: 'completed' }
      });

      await prisma.appointments.update({
        where: { id: payment.appointment_id },
        data: { status: 'confirmed', payment_id: payment.id }
      });
    }

    res.json({
      success: true,
      captureId: captureData.captureId,
      status: captureData.status
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/payments/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const event = req.body;
    console.log('PayPal webhook:', event.event_type);
    
    // TODO: Verify webhook signature
    // TODO: Handle different event types
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook failed' });
  }
});

export default router;
