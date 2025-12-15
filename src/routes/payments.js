import express from 'express';
import requireAuth from '../middlewares/auth.js';
import paymentService from '../services/payment.service.js';
import prisma from '../prisma.js';

const router = express.Router();

// ================== CREATE PAYPAL ORDER ==================
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

    const paypalOrder = await paymentService.createOrder(
      appointmentId,
      amount
    );

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

// ================== CAPTURE PAYPAL ORDER ==================
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
        data: {
          status: 'confirmed',
          payment_id: payment.id
        }
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

// ================== PAYPAL WEBHOOK ==================
router.post('/webhook', express.json(), async (req, res) => {
  try {
    const event = req.body;

    console.log('📩 PayPal Webhook Received');
    console.log('Event Type:', event.event_type);
    console.log('Full Body:', JSON.stringify(event, null, 2));
    console.log('Headers:', JSON.stringify(req.headers, null, 2));

    // Verify webhook signature (basic validation for sandbox)
    const transmissionId = req.headers['paypal-transmission-id'];
    const transmissionTime = req.headers['paypal-transmission-time'];
    const transmissionSig = req.headers['paypal-transmission-sig'];
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;

    console.log('🔐 Signature Check:');
    console.log('   Transmission ID:', transmissionId);
    console.log('   Transmission Time:', transmissionTime);
    console.log('   Transmission Sig:', transmissionSig);
    console.log('   Webhook ID:', webhookId);

    // Strict validation - require all PayPal headers
    if (!transmissionId || !transmissionTime || !transmissionSig) {
      console.error('❌ Missing webhook signature headers');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    if (!webhookId || webhookId === 'TEMP_VALUE') {
      console.error('❌ PAYPAL_WEBHOOK_ID not configured');
      return res.status(500).json({ error: 'Webhook not configured' });
    }

    // Handle different event types
    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        const resource = event.resource;
        const captureId = resource.id;
        const orderId = resource.supplementary_data?.related_ids?.order_id;
        const amount = resource.amount?.value;

        console.log(`💰 Payment Captured:`);
        console.log(`   Capture ID: ${captureId}`);
        console.log(`   Order ID: ${orderId}`);
        console.log(`   Amount: ${amount}`);

        if (!orderId) {
          console.warn('⚠️ No order ID in webhook event');
          return res.status(200).json({ received: true, warning: 'No order ID' });
        }

        // Update payment by order ID
        const payment = await prisma.payments.findFirst({
          where: { provider_payment_id: orderId }
        });

        if (payment) {
          await prisma.payments.update({
            where: { id: payment.id },
            data: {
              status: 'completed',
              updated_at: new Date()
            }
          });

          await prisma.appointments.update({
            where: { id: payment.appointment_id },
            data: {
              status: 'confirmed',
              payment_id: payment.id
            }
          });

          console.log(`✅ Payment ${payment.id} marked as COMPLETED`);
        } else {
          console.warn(`⚠️ No payment found for order ID: ${orderId}`);
        }
        break;
      }

      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED': {
        const resource = event.resource;
        const orderId = resource.supplementary_data?.related_ids?.order_id;

        console.log(`❌ Payment Failed for Order: ${orderId}`);

        if (!orderId) {
          return res.status(200).json({ received: true });
        }

        const payment = await prisma.payments.findFirst({
          where: { provider_payment_id: orderId }
        });

        if (payment) {
          await prisma.payments.update({
            where: { id: payment.id },
            data: { status: 'failed' }
          });

          await prisma.appointments.update({
            where: { id: payment.appointment_id },
            data: { status: 'cancelled' }
          });

          console.log(`✅ Payment ${payment.id} marked as FAILED`);
        }
        break;
      }

      case 'PAYMENT.CAPTURE.REFUNDED': {
        const resource = event.resource;
        const captureId = resource.supplementary_data?.related_ids?.capture_id;

        console.log(`💸 Payment Refunded: ${captureId}`);

        if (!captureId) {
          return res.status(200).json({ received: true });
        }

        const payment = await prisma.payments.findFirst({
          where: { provider_payment_id: captureId }
        });

        if (payment) {
          await prisma.payments.update({
            where: { id: payment.id },
            data: { status: 'refunded' }
          });

          await prisma.appointments.update({
            where: { id: payment.appointment_id },
            data: { status: 'cancelled' }
          });

          console.log(`✅ Payment ${payment.id} marked as REFUNDED`);
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event type: ${event.event_type}`);
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ received: true, event_type: event.event_type });
  } catch (error) {
    console.error('❌ Webhook Error:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});
export default router;