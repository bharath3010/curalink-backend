import paypalClient from '../config/paypal.js';
import paypal from '@paypal/checkout-server-sdk';
import prisma from '../prisma.js';

class PaymentService {
  async createOrder(appointmentId, amount) {
    if (!paypalClient) {
      throw new Error('PayPal not configured');
    }

    try {
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer("return=representation");
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: appointmentId,
          amount: {
            currency_code: 'USD',
            value: (amount / 100).toFixed(2)
          },
          description: `CuraLink Appointment - ${appointmentId}`
        }],
        application_context: {
          brand_name: 'CuraLink',
          return_url: `${process.env.FRONTEND_URL}/payment/success`,
          cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`
        }
      });

      const response = await paypalClient.execute(request);
      return {
        orderId: response.result.id,
        status: response.result.status,
        links: response.result.links
      };
    } catch (error) {
      console.error('PayPal create order error:', error);
      throw new Error('Failed to create PayPal order');
    }
  }

  async captureOrder(orderId) {
    if (!paypalClient) {
      throw new Error('PayPal not configured');
    }

    try {
      const request = new paypal.orders.OrdersCaptureRequest(orderId);
      request.requestBody({});
      const response = await paypalClient.execute(request);
      
      return {
        orderId: response.result.id,
        status: response.result.status,
        captureId: response.result.purchase_units[0]?.payments?.captures[0]?.id,
        amount: response.result.purchase_units[0]?.payments?.captures[0]?.amount
      };
    } catch (error) {
      console.error('PayPal capture error:', error);
      throw new Error('Failed to capture payment');
    }
  }

  calculateCancellationPenalty(appointmentStart, originalAmount) {
    const now = new Date();
    const appointmentDate = new Date(appointmentStart);
    const hoursUntil = (appointmentDate - now) / (1000 * 60 * 60);

    let penaltyPercent = 0;
    if (hoursUntil < 2) penaltyPercent = 100;
    else if (hoursUntil < 24) penaltyPercent = 50;
    else if (hoursUntil < 48) penaltyPercent = 25;

    const penalty = Math.round(originalAmount * (penaltyPercent / 100));
    const refund = originalAmount - penalty;

    return { penaltyPercent, penalty, refund };
  }
}

export default new PaymentService();
