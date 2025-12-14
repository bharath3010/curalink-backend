import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes from './routes/authRoutes.js';
import doctorsRoutes from './routes/doctors.js';
import apptRoutes from './routes/appointments.js';
import paymentsRoutes from './routes/payments.js';
import reviewsRoutes from './routes/reviews.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import adminRoutes from './routes/admin.routes.js';
import apiLimiter from './middlewares/rateLimit.middleware.js';

dotenv.config();
const app = express();

/* =======================
   SECURITY & BASIC SETUP
======================= */
app.use(helmet());
app.set('trust proxy', 1);

/* =======================
   CORS (IMPORTANT)
======================= */
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',')
  : ['http://localhost:5173'];

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

/* =======================
   LOGGING
======================= */
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* =======================
   PAYPAL WEBHOOK (RAW BODY)
   ⚠ MUST BE BEFORE express.json()
======================= */
app.use('/api/payments', paymentsRoutes);

/* =======================
   BODY PARSERS
======================= */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

/* =======================
   RATE LIMITER
======================= */
app.use('/api/', apiLimiter);

/* =======================
   ROUTES
======================= */
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorsRoutes);
app.use('/api/appointments', apptRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/admin', adminRoutes);

/* =======================
   ROOT & HEALTH
======================= */
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🏥 CuraLink API v1.0',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

app.get('/_health', (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/* =======================
   404 HANDLER
======================= */
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

/* =======================
   ERROR HANDLER
======================= */
app.use((err, req, res, next) => {
  console.error('🔥 Error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

/* =======================
   SERVER START
======================= */
const PORT = process.env.PORT || 8001;
const server = app.listen(PORT, () => {
  console.log('🏥 CuraLink API Server');
  console.log(`✅ Running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});

export default app;
