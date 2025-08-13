import Razorpay from 'razorpay';
import crypto from 'crypto';
import Subscription from "../model/subscription.Model.js";
import User from "../model/user.model.js";
import asyncHandler from "express-async-handler";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const createSubscriptionOrder = asyncHandler(async (req, res) => {
  const { amount, plan, billingCycle } = req.body;
  if (!amount || !plan || !billingCycle) {
    res.status(400);
    throw new Error("Amount, plan, and billingCycle are required");
  }

  const options = {
    amount: Number(amount) * 100,
    currency: "INR",
  };
  const order = await razorpay.orders.create(options);

  await Subscription.findOneAndUpdate(
    { userId: req.user.id },
    {
      amount,
      plan,
      billingCycle,
      razorpayOrderId: order.id,
      status: "pending",
    },
    { new: true } // Don't upsert; a doc should already exist
  );

  res.status(200).json({
    key: process.env.RAZORPAY_KEY_ID,
    orderId: order.id,
    amount: order.amount,
  });
});

const verifySubscriptionPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;
  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    res.status(400);
    throw new Error("Payment verification failed");
  }

  const subscription = await Subscription.findOne({
    razorpayOrderId: razorpay_order_id,
  });
  if (!subscription) {
    res.status(404);
    throw new Error("Subscription order not found");
  }

  subscription.razorpayPaymentId = razorpay_payment_id;
  subscription.razorpaySignature = razorpay_signature;
  subscription.status = "active";
  subscription.startDate = new Date();

  const endDate = new Date(subscription.startDate);
  if (subscription.billingCycle === "yearly") {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }
  subscription.endDate = endDate;
  await subscription.save();

  await User.findByIdAndUpdate(subscription.userId, {
    currentPlan: subscription.plan,
  });

  res
    .status(200)
    .json({ message: "Subscription activated successfully", subscription });
});

const getMySubscription = asyncHandler(async (req, res) => {
  // The logic is now simple: a subscription document MUST exist for every user.
  const subscription = await Subscription.findOne({ userId: req.user.id });

  if (!subscription) {
    // This case should ideally never be reached for a logged-in user, but is a good safeguard.
    return res
      .status(404)
      .json({
        message: "CRITICAL: Subscription record not found for this user.",
      });
  }

  res.status(200).json(subscription);
});

const cancelMySubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOneAndUpdate(
    { userId: req.user.id, status: "active" },
    { $set: { status: "cancelled" } },
    { new: true }
  );
  if (!subscription) {
    res.status(404);
    throw new Error("No active subscription found to cancel");
  }
  res
    .status(200)
    .json({ message: "Subscription cancelled successfully", subscription });
});

const getAllSubscriptions = asyncHandler(async (req, res) => {
  const subscriptions = await Subscription.find({}).populate(
    "userId",
    "name email"
  );
  res.status(200).json(subscriptions);
});

export {
  createSubscriptionOrder,
  verifySubscriptionPayment,
  getMySubscription,
  cancelMySubscription,
  getAllSubscriptions,
};