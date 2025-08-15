import asyncHandler from "express-async-handler";
import { getEntitlements } from "../conifg/planPolicy.js";

const checkSubscription = asyncHandler(async (req, res, next) => {
  const subscription = req.subscription;

  if (!subscription) {
    return res.status(403).json({
      message: "Your subscription could not be verified. Please log in again.",
      code: "SUBSCRIPTION_NOT_FOUND",
    });
  }

  const entitlements = getEntitlements(subscription.plan, subscription.status);

  if (!entitlements.isActive) {
    return res.status(403).json({
      message: "Your subscription has expired. Please upgrade to continue.",
      code: "SUBSCRIPTION_EXPIRED",
    });
  }

  req.entitlements = entitlements;

  next();
});

export default checkSubscription;
