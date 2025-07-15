import express from 'express';
import {
  createPayPalOrder,
  capturePayPalPayment,
  getMyTransactions,
  getTransactionById,
  getAllTransactions,
} from '../controllers/transaction.controller.js';

const protect = (req, res, next) => {
  req.user = { id: '655e6e3c5a7a6e1f4b8f3a3a' };
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }
  next();
};

const admin = (req, res, next) => {
  next();
};

const router = express.Router();

router.post('/create-order', protect, createPayPalOrder);
router.post('/capture-order', protect, capturePayPalPayment);

router.get('/me', protect, getMyTransactions);
router.get('/:id', protect, getTransactionById);
router.get('/', protect, admin, getAllTransactions);

export default router;