import express from 'express';
import requireAuth from '../middlewares/auth.js';
import { getPendingDoctors, verifyDoctor, getAdminStats } from '../controllers/admin/adminController.js';

const router = express.Router();

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

router.get('/doctors/pending', requireAuth, requireAdmin, getPendingDoctors);
router.post('/doctors/:id/verify', requireAuth, requireAdmin, verifyDoctor);
router.get('/stats', requireAuth, requireAdmin, getAdminStats);

export default router;
