import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Profile picture storage
const profileStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'curalink/profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }]
  }
});

// Document storage (verification docs)
const documentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'curalink/documents',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf']
  }
});

// Medical records storage
const medicalStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'curalink/medical',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf']
  }
});

export const uploadProfile = multer({ 
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

export const uploadDocument = multer({ 
  storage: documentStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

export const uploadMedical = multer({ 
  storage: medicalStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

export { cloudinary };
