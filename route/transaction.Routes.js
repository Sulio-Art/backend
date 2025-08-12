import express from 'express';
import {
  createPayPalOrder,
  capturePayPalPayment,
  getMyTransactions,
  getTransactionById,
  getAllTransactions,
} from "../controller/transaction.Controller.js";

import { protect, isAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();


router.post('/create-order', protect, createPayPalOrder);
router.post('/capture-order', protect, capturePayPalPayment);
router.get('/me', protect, getMyTransactions);
router.get('/:id', protect, getTransactionById);


router.get('/', protect, isAdmin, getAllTransactions);

export default router;