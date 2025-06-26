import express from 'express';
import {
  getMySettings,
  updateMySettings
} from '../controller/setting.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/me')
  .get(getMySettings)
  .put(updateMySettings);

export default router;