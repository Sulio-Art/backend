import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getMySubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
} from "../controller/subscription.Controller.js";

const router = express.Router();


router.get("/mine", protect, getMySubscription);


router.post("/", protect, createSubscription);
router.put("/:id", protect, updateSubscription);
router.delete("/:id", protect, cancelSubscription);

export default router;
