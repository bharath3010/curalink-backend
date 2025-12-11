import express from 'express';
import requireAuth from '../middlewares/auth.js';
import { createReview, getDoctorReviews } from '../controllers/reviews/reviewController.js';

const router = express.Router();

router.post('/', requireAuth, createReview);
router.get('/doctor/:doctorId', getDoctorReviews);

export default router;
