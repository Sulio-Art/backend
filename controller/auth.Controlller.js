import User from "../model/user.model.js";
import Subscription from "../model/subscription.Model.js";
import Otp from "../model/otp.model.js";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import sendEmail from "../utils/sendEmails.js";
import fetch from "node-fetch";

export const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

export const checkEmailExists = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400);
    throw new Error("Email is required.");
  }
  const user = await User.findOne({ email });
  res.status(200).json({ exists: !!user });
});

export const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  let user = await User.findOne({ email });
  if (user) {
    res.status(409);
    throw new Error(
      "An account with this email already exists. Please log in."
    );
  }

  user = new User({
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

  const token = generateToken(user._id);
  res.status(201).json({
    message: "Registration successful! Your 90-day trial has started.",
    token,
    user: { _id: user._id, email: user.email },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  const subscription = await Subscription.findOne({ userId: user._id });
  const subscriptionStatus = subscription ? subscription.status : "expired";

  if (!user.isVerified) {
    return res.status(401).json({
      message: "Email not verified. Please check your email for an OTP.",
    });
  }

  const token = generateToken(user._id);
  res.status(200).json({
    message: "Login successful",
    token,
    user: {
      _id: user._id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      subscriptionStatus: subscriptionStatus,
      currentPlan: user.currentPlan,
      instagramUserId: user.instagramUserId,
      role: user.role,
    },
  });
});

export const sendVerificationOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400);
    throw new Error("Email is required.");
  }
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    res.status(409);
    throw new Error(
      "An account with this email already exists. Please log in."
    );
  }
  const otp = crypto.randomInt(100000, 999999).toString();
  await Otp.findOneAndUpdate(
    { email },
    { email, otp },
    { upsert: true, new: true }
  );
  try {
    await sendEmail(
      email,
      "Verify Your Email for Sulio AI",
      `Your verification code is: ${otp}\nThis code will expire in 10 minutes.`
    );
    res.status(200).json({ message: "OTP sent successfully." });
  } catch (emailError) {
    res.status(500);
    throw new Error("There was an issue sending the OTP email.");
  }
});

export const verifyHeroOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    res.status(400);
    throw new Error("Email and OTP are required.");
  }
  const tempOtp = await Otp.findOne({ email });
  if (!tempOtp || tempOtp.otp !== otp) {
    res.status(400);
    throw new Error("Invalid or expired OTP.");
  }
  await Otp.deleteOne({ email });
  res.status(200).json({
    message: "Email verified successfully. Please complete your registration.",
  });
});

export const sendInstagramEmailOtp = asyncHandler(async (req, res) => {
  const { email, completionToken } = req.body;
  if (!email || !completionToken) {
    res.status(400);
    throw new Error("Email and completion token are required.");
  }
  try {
    jwt.verify(completionToken, process.env.JWT_SECRET);
  } catch (err) {
    res.status(401);
    throw new Error("Invalid or expired completion token.");
  }
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    res.status(409);
    throw new Error(
      "An account with this email already exists. Please use a different email."
    );
  }
  const otp = crypto.randomInt(100000, 999999).toString();
  await Otp.findOneAndUpdate(
    { email },
    { email, otp },
    { upsert: true, new: true }
  );
  try {
    await sendEmail(
      email,
      "Verify Your Email for Sulio AI",
      `Your verification code is: ${otp}\nThis code will expire in 10 minutes.`
    );
    res.status(200).json({ message: "OTP sent successfully to your email." });
  } catch (emailError) {
    res.status(500);
    throw new Error("There was an issue sending the OTP email.");
  }
});

export const verifyInstagramEmailOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    res.status(400);
    throw new Error("Email and OTP are required.");
  }
  const tempOtp = await Otp.findOne({ email });
  if (!tempOtp || tempOtp.otp !== otp) {
    res.status(400);
    throw new Error("Invalid or expired OTP.");
  }
  await Otp.deleteOne({ email });
  res.status(200).json({
    message: "Email verified successfully. You can now set your password.",
  });
});

export const completeInstagramRegistration = asyncHandler(async (req, res) => {
  const { completionToken, password, firstName, lastName, email } = req.body;
  if (!completionToken || !password || !firstName || !lastName || !email) {
    res.status(400);
    throw new Error("All fields and completion token are required.");
  }
  let decoded;
  try {
    decoded = jwt.verify(completionToken, process.env.JWT_SECRET);
  } catch (err) {
    res.status(401);
    throw new Error("Invalid or expired completion token.");
  }
  const { instagramId, instagramUsername, instagramAccessToken } = decoded;
  let user = await User.findOne({
    $or: [{ instagramUserId: instagramId }, { email: email }],
  });
  if (user) {
    res.status(409);
    throw new Error(
      "An account is already associated with this Instagram profile or email."
    );
  }

  user = new User({
    firstName,
    lastName,
    email,
    password,
    instagramUserId: instagramId,
    instagramUsername: instagramUsername,
    instagramAccessToken: instagramAccessToken,
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

  const finalToken = generateToken(user._id);
  res.status(201).json({
    message: "Registration complete. Welcome!",
    token: finalToken,
    user: {
      _id: user._id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
    },
  });
});

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("No user found with this email");
  }
  const otp = crypto.randomInt(100000, 999999).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
  user.otp = otp;
  user.otpExpires = otpExpires;
  await user.save();
  await sendEmail(
    email,
    "Your Password Reset OTP",
    `Your password reset OTP is: ${otp}\nThis code will expire in 10 minutes.`
  );
  res
    .status(200)
    .json({ message: "OTP for password reset sent to your email." });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (user.otp !== otp || user.otpExpires < Date.now()) {
    res.status(400);
    throw new Error("Invalid or expired OTP");
  }
  user.password = newPassword;
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();
  res
    .status(200)
    .json({ message: "Password reset successful. You can now login." });
});

export const logout = asyncHandler(async (req, res) => {
  res.cookie("token", "", {
    httpOnly: true,
    expires: new Date(0),
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.status(200).json({ message: "Logged out successfully" });
});

export const getMe = asyncHandler(async (req, res) => {
  console.log("\n--- [BACKEND /me] Endpoint Hit ---");
  // req.user is populated by your 'protect' middleware
  const userFromDb = await User.findById(req.user.id).select("-password");

  if (userFromDb) {
    console.log(
      "[BACKEND /me] Found user in database. User data being sent to frontend:",
      {
        id: userFromDb._id,
        firstName: userFromDb.firstName,
        lastName: userFromDb.lastName,
        email: userFromDb.email,
        phoneNumber: userFromDb.phoneNumber,
        subscriptionStatus: req.user.subscriptionStatus, // This comes from middleware
        currentPlan: userFromDb.currentPlan,
        instagramUserId: userFromDb.instagramUserId, // <<< CHECK THIS VALUE
        role: userFromDb.role,
      }
    );

    res.status(200).json({
      user: {
        id: userFromDb._id,
        firstName: userFromDb.firstName,
        lastName: userFromDb.lastName,
        email: userFromDb.email,
        phoneNumber: userFromDb.phoneNumber,
        subscriptionStatus: req.user.subscriptionStatus,
        currentPlan: userFromDb.currentPlan,
        instagramUserId: userFromDb.instagramUserId,
        role: userFromDb.role,
      },
    });
  } else {
    console.error("[BACKEND /me] ERROR: User not found for ID:", req.user.id);
    res.status(404);
    throw new Error("User not found");
  }
});