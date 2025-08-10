import express from 'express';
import {
  createOrUpdateMyProfile,
  getMyProfile,
  getProfileByUserId,
  getAllProfiles,
  deleteMyProfile,
} from '../controller/profile.Controller.js';
import { upload } from '../middleware/cloudinery.middleware.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();


const profileUploads = upload.fields([
    { name: 'profilePicture', maxCount: 1 },
    { name: 'coverPhoto', maxCount: 1 }
]);


router.get('/', protect, getAllProfiles); 


router.route('/me')
  .get(protect, getMyProfile)
  .put(protect, profileUploads, createOrUpdateMyProfile) 
  .delete(protect, deleteMyProfile);


router.get('/user/:userId', protect, getProfileByUserId);

export default router;