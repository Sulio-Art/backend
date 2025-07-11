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

router.get('/', getAllProfiles);

router.route('/me')
  .get(protect, getMyProfile)
  .post(protect, upload.single('profilePicture'),createOrUpdateMyProfile)
  .put(protect, createOrUpdateMyProfile)
  .delete(protect, deleteMyProfile);

router.get('/user/:userId', getProfileByUserId);

export default router;