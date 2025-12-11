import express from 'express';
import requireAuth from '../middlewares/auth.js';
import { uploadProfile, uploadDocument } from '../middlewares/upload.middleware.js';
import prisma from '../prisma.js';

const router = express.Router();

// Upload profile picture
router.post('/profile', requireAuth, uploadProfile.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.userId;
    
    // Update user avatar_url
    const user = await prisma.users.update({
      where: { id: userId },
      data: { avatar_url: req.file.path }
    });

    res.json({
      success: true,
      data: {
        url: req.file.path,
        publicId: req.file.filename
      }
    });
  } catch (error) {
    next(error);
  }
});

// Upload verification document (for doctors)
router.post('/verification', requireAuth, uploadDocument.single('document'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.userId;
    const { fileType } = req.body; // e.g., 'license', 'degree', 'certificate'

    // Get doctor record
    const doctor = await prisma.doctors.findFirst({
      where: { user_id: userId }
    });

    if (!doctor) {
      return res.status(403).json({ error: 'Only doctors can upload verification documents' });
    }

    // Create verification document record
    const doc = await prisma.verification_docs.create({
      data: {
        doctor_id: doctor.id,
        file_url: req.file.path,
        file_type: fileType || 'other',
        filename: req.file.filename,
        status: 'pending'
      }
    });

    res.json({
      success: true,
      data: doc
    });
  } catch (error) {
    next(error);
  }
});

export default router;
