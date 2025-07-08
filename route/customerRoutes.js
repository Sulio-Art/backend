import express from 'express';
import { createCustomer, getCustomers } from '../controller/customer.Controller.js';
// import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

router.route('/').post(createCustomer).get(protect, getCustomers);

export default router;