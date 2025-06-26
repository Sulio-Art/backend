import express from 'express';
import {
  createRazorpaySubscription,
} from '../controller/subscription.Controller.js';
// import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();


router.post('/razorpay/subscribe',createRazorpaySubscription);
// router.post('/paypal/create-order',createPayPalOrder);
// router.post('/paypal/capture-payment',capturePayPalPayment);

export default router;