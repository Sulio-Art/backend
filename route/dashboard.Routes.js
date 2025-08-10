import express from 'express';
import { getDashboardStats ,getOnboardingStatus } from '../controller/dashboard.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/stats', protect, getDashboardStats);
router.get('/onboarding-status', protect, getOnboardingStatus);

export default router;