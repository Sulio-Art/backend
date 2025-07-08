import express from 'express';
import { register, verifyOtp, login ,requestPasswordReset,resetPassword, logout} from '../controller/auth.Controlller.js';

const router = express.Router();

router.post('/register', register);
router.post('/verify', verifyOtp);
router.post('/login', login);   
router.post('/request-password-reset', requestPasswordReset);   
router.post('/reset-password', resetPassword);   
router.post('/logout', logout)

export default router;