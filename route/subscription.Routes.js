import express from 'express';
import {
  createSubscriptionOrder,
  verifySubscriptionPayment,
  getMySubscription,
  cancelMySubscription,
  getAllSubscriptions,
} from '../controller/subscription.Controller.js';

import { protect, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/create", protect, createSubscriptionOrder);
router.post("/verify", protect, verifySubscriptionPayment);
router.get("/mine", protect, getMySubscription);
router.patch("/cancel", protect, cancelMySubscription);
router.get("/all", protect, isAdmin, getAllSubscriptions);

export default router;