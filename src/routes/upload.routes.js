import express from 'express';
import { uploadProfile, uploadDocument } from '../middlewares/upload.middleware.js';
import prisma from '../prisma.js';

const router = express.Router();

// Middleware to check if user is authenticated
import jwt from 'jsonwebtoken';

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });

  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};


// Upload profile picture
router.post('/profile', requireAuth, uploadProfile.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // For now, return the uploaded file info
    // In production, update user's avatar_url in database
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

    const { fileType } = req.body;

    res.json({
      success: true,
      data: {
        url: req.file.path,
        publicId: req.file.filename,
        fileType: fileType || 'other'
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
