import express from 'express';
import { getAdminDashboardStats } from '../controller/admin.controller.js';
import { protect, isAdmin } from '../middleware/auth.middleware.js'; 

const router = express.Router();


router.get('/dashboard-stats', protect, isAdmin, getAdminDashboardStats);

export default router;