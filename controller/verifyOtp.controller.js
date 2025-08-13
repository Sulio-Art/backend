import jwt from "jsonwebtoken";
import User from "../model/user.model.js";
import Subscription from "../model/subscription.Model.js"; // <-- Import Subscription model
import asyncHandler from "express-async-handler";

/**
 * LOGICAL FIX: This controller now finalizes the registration.
 * It verifies the user, creates the trial subscription, and generates the login token.
 */
export const verifyUserOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    res.status(404);
    throw new Error("User not found.");
  }

  // Check for OTP on the user document itself, and ensure it hasn't expired
  if (user.otp !== otp || user.otpExpires < Date.now()) {
    res.status(400);
    throw new Error("Invalid or expired OTP.");
  }

  // Finalize user verification
  user.isVerified = true;
  user.otp = undefined;
  user.otpExpires = undefined;

  // Create the 90-day trial subscription
  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 90);

  await Subscription.create({
    userId: user._id,
    plan: "premium",
    status: "trial",
    amount: 0,
    billingCycle: "trial",
    startDate: new Date(),
    endDate: trialEndDate,
  });

  // Also update the user's plan status
  user.currentPlan = "premium";
  await user.save();

  // Generate a token for auto-login
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

  res.status(200).json({
    message: "Account verified successfully! Your 90-day trial has started.",
    token,
    user: {
      _id: user._id,
      email: user.email,
    },
  });
});
