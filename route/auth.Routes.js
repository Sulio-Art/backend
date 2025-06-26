import express from 'express';
import { register, verifyOtp, login ,requestPasswordReset,resetPassword} from '../controller/auth.Controlller.js';

const router = express.Router();

router.post('/register', register);
router.post('/verify', verifyOtp);
router.post('/login', login);   
router.post('/request-password-reset', requestPasswordReset);   
router.post('/reset-password', resetPassword);   

export default router;