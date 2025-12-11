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

// Security headers
app.use(helmet());

// Trust proxy (important for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// CORS configuration
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',') 
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('Not allowed by CORS'), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🏥 CuraLink API v1.0 - Production Ready',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth/*',
      doctors: '/api/doctors',
      appointments: '/api/appointments',
      payments: '/api/payments',
      reviews: '/api/reviews',
      uploads: '/api/uploads',
      admin: '/api/admin'
    }
  });
});

// Health check
app.get('/_health', (req, res) => res.json({ 
  ok: true, 
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
  environment: process.env.NODE_ENV
}));

// Apply rate limiting to all routes
app.use('/api/', apiLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorsRoutes);
app.use('/api/appointments', apptRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // Don't leak error details in production
  const isDev = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal server error',
    ...(isDev && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 8001;
const server = app.listen(PORT, () => {
  console.log('🏥 CuraLink API Server');
  console.log('======================');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 Base URL: http://localhost:${PORT}`);
  console.log('======================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
