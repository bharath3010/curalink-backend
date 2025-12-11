import { z } from 'zod';

export function validateBody(schema) {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }
  };
}

// Common validation schemas
export const schemas = {
  register: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(100),
    role: z.enum(['patient', 'doctor']).optional()
  }),
  
  login: z.object({
    email: z.string().email(),
    password: z.string().min(1)
  }),
  
  createAppointment: z.object({
    doctorId: z.string().uuid(),
    appointmentStart: z.string().datetime(),
    durationMinutes: z.number().min(15).max(120).optional(),
    reason: z.string().max(500).optional()
  }),
  
  createReview: z.object({
    appointmentId: z.string().uuid(),
    overallRating: z.number().min(1).max(5),
    bedside: z.number().min(1).max(5).optional(),
    waitTime: z.number().min(1).max(5).optional(),
    staffFriendliness: z.number().min(1).max(5).optional(),
    comment: z.string().max(1000).optional(),
    anonymous: z.boolean().optional()
  })
};
