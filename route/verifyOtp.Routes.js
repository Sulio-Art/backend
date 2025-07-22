import express from 'express';
import { verifyUserOtp } from '../controller/verifyOtp.controller.js';

const router = express.Router();

router.post('/', verifyUserOtp);

export default router;