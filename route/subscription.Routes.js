import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import billingPaused from "../middleware/billingPaused.js";
import {
  getMySubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
} from "../controller/subscription.Controller.js";

const router = express.Router();


router.get("/mine", protect, getMySubscription);


// PAUSED: these accepted `plan` and `status` straight from the request body,
// letting any authenticated user grant themselves a paid plan. They stay behind
// billingPaused until plan changes are driven by verified payment webhooks.
router.post("/", protect, billingPaused, createSubscription);
router.put("/:id", protect, billingPaused, updateSubscription);

// Cancellation is left enabled on purpose: it is ownership-checked and can only
// downgrade, and users should not be blocked from cancelling.
router.delete("/:id", protect, cancelSubscription);

export default router;
