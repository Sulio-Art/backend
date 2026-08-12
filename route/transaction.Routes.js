import express from 'express';
import {
  createPayPalOrder,
  capturePayPalPayment,
  getMyTransactions,
  getTransactionById,
  getAllTransactions,
} from "../controller/transaction.Controller.js";

import { protect, isAdmin } from '../middleware/auth.middleware.js';
import billingPaused from '../middleware/billingPaused.js';

const router = express.Router();


// PAUSED: capture-order does not verify the order belongs to the caller and the
// PayPal client is pinned to the sandbox environment, so no upgrade here is real.
router.post('/create-order', protect, billingPaused, createPayPalOrder);
router.post('/capture-order', protect, billingPaused, capturePayPalPayment);
router.get('/me', protect, getMyTransactions);
router.get('/:id', protect, getTransactionById);


router.get('/', protect, isAdmin, getAllTransactions);

export default router;