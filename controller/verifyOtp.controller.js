import jwt from "jsonwebtoken";
import User from "../model/user.model.js";
import Subscription from "../model/subscription.Model.js";
import Otp from "../model/otp.model.js";
import asyncHandler from "express-async-handler";


export const verifyUserOtp = asyncHandler(async (req, res) => {
  
  const { firstName, lastName, email, password, otp } = req.body;

  if (!firstName || !lastName || !email || !password || !otp) {
    res.status(400);
    throw new Error("All registration details and OTP are required.");
  }

  
  const tempOtp = await Otp.findOne({ email });
  if (!tempOtp || tempOtp.otp !== otp) {
    res.status(400);
    throw new Error("Invalid or expired OTP. Please try registering again.");
  }

  
  const userExists = await User.findOne({ email });
  if (userExists) {
    await Otp.deleteOne({ email }); 
    res.status(409);
    throw new Error("An account with this email already exists.");
  }


  const user = new User({
    firstName,
    lastName,
    email,
    password,
    isVerified: true,
    currentPlan: "premium",
  });
  await user.save();

  
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


  await Otp.deleteOne({ email });

  
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

  res.status(201).json({
    message: "Account verified successfully! Your 90-day trial has started.",
    token,
    user: {
      _id: user._id,
      email: user.email,
    },
  });
});