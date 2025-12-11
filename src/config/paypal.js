import paypal from '@paypal/checkout-server-sdk';

function environment() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.warn('⚠️ PayPal credentials not configured');
    return null;
  }
  
  if (process.env.PAYPAL_MODE === 'production') {
    return new paypal.core.LiveEnvironment(clientId, clientSecret);
  }
  return new paypal.core.SandboxEnvironment(clientId, clientSecret);
}

const env = environment();
const client = env ? new paypal.core.PayPalHttpClient(env) : null;

export default client;
