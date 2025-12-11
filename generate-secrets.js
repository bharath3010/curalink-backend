import crypto from 'crypto';

console.log('🔐 Generating Production Secrets');
console.log('=================================\n');

console.log('Copy these to your production environment variables:\n');

console.log('JWT_ACCESS_SECRET=');
console.log(crypto.randomBytes(64).toString('base64'));

console.log('\nJWT_REFRESH_SECRET=');
console.log(crypto.randomBytes(64).toString('base64'));

console.log('\n=================================');
console.log('⚠️  Store these securely!');
console.log('⚠️  Never commit to git!');
