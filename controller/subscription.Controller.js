import Razorpay from 'razorpay';
import crypto from 'crypto';
import Subscription from '../models/subscription.model.js';
import User from "../models/user.model.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const createSubscriptionOrder = async (req, res) => {
  try {
    const { amount, plan } = req.body;
    if (!amount || !plan) {
      return res.status(400).json({ message: "Amount and plan are required" });
    }

    const options = {
      amount: Number(amount) * 100,
      currency: "INR",
    };
    const order = await razorpay.orders.create(options);

    await Subscription.findOneAndUpdate(
      { userId: req.user.id },
      {
        userId: req.user.id,
        amount,
        plan,
        razorpayOrderId: order.id,
        status: "pending",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      key: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const verifySubscriptionPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Payment verification failed" });
    }

    const subscription = await Subscription.findOne({
      razorpayOrderId: razorpay_order_id,
    });
    if (!subscription) {
      return res.status(404).json({ message: "Subscription order not found" });
    }

    subscription.razorpayPaymentId = razorpay_payment_id;
    subscription.razorpaySignature = razorpay_signature;
    subscription.status = "active";
    subscription.startDate = new Date();
    const endDate = new Date();
    if (
      subscription.plan === "basic" ||
      subscription.plan === "premium" ||
      subscription.plan === "pro"
    ) {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    subscription.endDate = endDate;

    await subscription.save();

    await User.findByIdAndUpdate(subscription.userId, {
      subscriptionStatus: "active",
      currentPlan: subscription.plan,
      trialEndsAt: undefined,
      subscriptionId: subscription._id,
    });

    res
      .status(200)
      .json({ message: "Subscription activated successfully", subscription });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getMySubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ userId: req.user.id });
    if (!subscription) {
      return res.status(404).json({ message: "No active subscription found" });
    }
    res.status(200).json(subscription);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const cancelMySubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOneAndUpdate(
      { userId: req.user.id, status: "active" },
      { $set: { status: "cancelled" } },
      { new: true }
    );
    if (!subscription) {
      return res
        .status(404)
        .json({ message: "No active subscription found to cancel" });
    }

    const user = await User.findById(subscription.userId);
    if (user) {
      user.subscriptionStatus = "cancelled";
      await user.save();
    }
    res
      .status(200)
      .json({ message: "Subscription cancelled successfully", subscription });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({}).populate('userId', 'name email');
    res.status(200).json(subscriptions);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export {
  createSubscriptionOrder,
  verifySubscriptionPayment,
  getMySubscription,
  cancelMySubscription,
  getAllSubscriptions,
};