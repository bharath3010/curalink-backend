import paymentService from '../../services/payment.service.js';
import prisma from '../../prisma.js';

// POST /api/payments/create-order
export async function createOrder(req, res, next) {
  try {
    const { appointmentId } = req.body;
    
    if (!appointmentId) {
      return res.status(400).json({ error: 'appointmentId is required' });
    }

    // Get appointment details
    const appointment = await prisma.appointments.findUnique({
      where: { id: appointmentId },
      include: {
        doctor: true
      }
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Get doctor's fee
    const doctor = await prisma.doctors.findUnique({
      where: { id: appointment.doctor_id }
    });

    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const amount = doctor.fee;

    // Create PayPal order
    const paypalOrder = await paymentService.createOrder(appointmentId, amount);

    // Create payment record
    const payment = await prisma.payments.create({
      data: {
        appointment_id: appointmentId,
        amount,
        platform_fee: Math.round(amount * 0.05), // 5% platform fee
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
}

// POST /api/payments/capture-order
export async function captureOrder(req, res, next) {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    // Capture the PayPal order
    const captureData = await paymentService.captureOrder(orderId);

    // Update payment record
    const payment = await prisma.payments.findFirst({
      where: { provider_payment_id: orderId }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    await prisma.payments.update({
      where: { id: payment.id },
      data: {
        status: 'completed',
        updated_at: new Date()
      }
    });

    // Update appointment status
    await prisma.appointments.update({
      where: { id: payment.appointment_id },
      data: {
        status: 'confirmed',
        payment_id: payment.id
      }
    });

    res.json({
      success: true,
      captureId: captureData.captureId,
      status: captureData.status,
      amount: captureData.amount
    });
  } catch (error) {
    next(error);
  }
}

// POST /api/payments/webhook
export async function handleWebhook(req, res) {
  try {
    const webhookEvent = req.body;
    
    console.log('PayPal Webhook Event:', webhookEvent.event_type);

    // Handle different webhook events
    switch (webhookEvent.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        // Payment captured successfully
        const captureId = webhookEvent.resource.id;
        console.log(`Payment captured: ${captureId}`);
        break;

      case 'PAYMENT.CAPTURE.DENIED':
        // Payment denied
        console.log('Payment denied');
        break;

      case 'PAYMENT.CAPTURE.REFUNDED':
        // Payment refunded
        console.log('Payment refunded');
        break;

      default:
        console.log(`Unhandled event type: ${webhookEvent.event_type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
