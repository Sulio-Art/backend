import asyncHandler from "express-async-handler";
import Subscription from "../model/subscription.Model.js";
import { getEntitlements } from "../conifg/planPolicy.js";

export const getMySubscription = asyncHandler(async (req, res) => {
  
  const subscription = req.subscription;

  if (!subscription) {
   
    res.status(404);
    throw new Error("Subscription not found for user.");
  }

  let daysRemaining = null;
  if (subscription.endDate) {
    const now = new Date();
    const endDate = new Date(subscription.endDate);
    const diffTime = Math.max(endDate - now, 0);
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }


  const entitlements = getEntitlements(subscription.plan, subscription.status);

  res.status(200).json({
    plan: subscription.plan,
    status: subscription.status,
    startDate: subscription.startDate,
    endDate: subscription.endDate,
    daysRemaining,
    entitlements,
  });
});


export const createSubscription = asyncHandler(async (req, res) => {
  const { plan, status, trialEndsAt, currentPeriodEnd } = req.body;
  const newSubscription = await Subscription.create({
    userId: req.user._id,
    plan,
    status,
    trialEndsAt,
    currentPeriodEnd,
    startDate: new Date(),
  });
  res.status(201).json(newSubscription);
});

export const updateSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id);
  if (!subscription) {
    res.status(404);
    throw new Error("Subscription not found");
  }
  if (subscription.userId.toString() !== req.user._id.toString()) {
    res.status(401);
    throw new Error("Not authorized to update this subscription");
  }
  Object.assign(subscription, req.body);
  const updatedSubscription = await subscription.save();
  res.status(200).json(updatedSubscription);
});

export const cancelSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id);
  if (!subscription) {
    res.status(404);
    throw new Error("Subscription not found");
  }
  if (subscription.userId.toString() !== req.user._id.toString()) {
    res.status(401);
    throw new Error("Not authorized to cancel this subscription");
  }
  subscription.status = "cancelled";
  await subscription.save();
  res.status(200).json({ message: "Subscription cancelled" });
});
