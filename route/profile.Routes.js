import express from 'express';
import {
  createOrUpdateMyProfile,
  getMyProfile,
  getProfileByUserId,
  getAllProfiles,
  deleteMyProfile,
} from '../controller/profile.Controller.js';
import { upload } from '../middleware/cloudinery.middleware.js';
import { protect, admin } from '../middleware/auth.middleware.js';

const router = express.Router();

// This route correctly requires admin privileges.
router.get('/', protect, admin, getAllProfiles); 

//
// THIS IS THE DEFINITIVE FIX:
// The route for a user to get their OWN profile should ONLY use 'protect'.
//
router.route('/me')
  .get(protect, getMyProfile) // <-- 'admin' has been permanently removed.
  .post(protect, upload.single('profilePicture'), createOrUpdateMyProfile)
  .put(protect, upload.single('profilePicture'), createOrUpdateMyProfile)
  .delete(protect, deleteMyProfile);


// This route correctly allows any logged-in user to view another user's profile.
router.get('/user/:userId', protect, getProfileByUserId);

export default router;