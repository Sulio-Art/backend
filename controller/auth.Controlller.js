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
  if (!firstName || !lastName || !email || !password) {
    res.status(400);
    throw new Error("All fields are required.");
  }
  const userExists = await User.findOne({ email });

  
  if (userExists) {
    
    return res.status(409).json({
      message: "An account with this email already exists. Please log in.",
    });
  }
 

  const otp = crypto.randomInt(100000, 999999).toString();
  await Otp.findOneAndUpdate(
    { email },
    { email, otp },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  try {
    await sendEmail(
      email,
      "Verify Your Email for Sulio AI",
      `Your verification code is: ${otp}\nThis code will expire in 10 minutes.`
    );
    res.status(200).json({
      message:
        "OTP sent to your email. Please verify to complete registration.",
    });
  } catch (emailError) {
    console.error("Registration OTP Email Error:", emailError);
    res.status(500);
    throw new Error("There was an issue sending the verification email.");
  }
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
   
    return res.status(409).json({
      message: "An account with this email already exists. Please log in.",
    });
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
  const registrationToken = jwt.sign({ email }, process.env.JWT_SECRET, {
    expiresIn: "15m",
  });
  res.status(200).json({
    message: "Email verified successfully. Please complete your registration.",
    registrationToken: registrationToken,
  });
});

export const finalizePreverifiedRegistration = asyncHandler(
  async (req, res) => {
    const { registrationToken, firstName, lastName, password } = req.body;
    if (!registrationToken || !firstName || !lastName || !password) {
      res.status(400);
      throw new Error("Missing required registration details or token.");
    }
    let decoded;
    try {
      decoded = jwt.verify(registrationToken, process.env.JWT_SECRET);
    } catch (err) {
      res.status(401);
      throw new Error(
        "Invalid or expired registration session. Please start over."
      );
    }
    const { email } = decoded;
    let userExists = await User.findOne({ email });
    if (userExists) {
      res.status(409);
      throw new Error(
        "An account with this email already exists. Please log in."
      );
    }

    const newUser = new User({
      firstName,
      lastName,
      email,
      password,
      isVerified: true,
      currentPlan: "free",
    });
    await newUser.save();

    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 90);
    const newSubscription = await Subscription.create({
      userId: newUser._id,
      plan: "free",
      status: "trial",
      amount: 0,
      billingCycle: "trial",
      startDate: new Date(),
      endDate: trialEndDate,
    });

    newUser.subscriptionId = newSubscription._id;
    await newUser.save();

    await Otp.deleteOne({ email });

    const loginToken = generateToken(newUser._id);
    res.status(201).json({
      message: "Registration successful! Your 90-day free trial has started.",
      token: loginToken,
      user: { _id: newUser._id, email: newUser.email },
    });
  }
);

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("No user found with this email");
  }
  const otp = crypto.randomInt(100000, 999999).toString();
  await Otp.findOneAndUpdate(
    { email },
    { email, otp },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await sendEmail(
    email,
    "Your Password Reset OTP",
    `Your password reset OTP is: ${otp}\nThis code will expire in 10 minutes.`
  );
  res
    .status(200)
    .json({ message: "OTP for password reset sent to your email." });
});

export const verifyPasswordResetOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required." });
  }
  const resetOtp = await Otp.findOne({ email, otp });
  if (!resetOtp) {
    return res.status(400).json({ message: "Invalid or expired OTP." });
  }
  res.status(200).json({ message: "OTP verified successfully." });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  const resetOtp = await Otp.findOne({ email });
  if (!resetOtp || resetOtp.otp !== otp) {
    res.status(400);
    throw new Error("Invalid or expired OTP");
  }
  user.password = newPassword;
  await user.save();
  await Otp.deleteOne({ email });
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
  const userFromDb = await User.findById(req.user.id).select("-password");
  if (userFromDb) {
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
    res.status(404);
    throw new Error("User not found");
  }
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

  let userExists = await User.findOne({
    $or: [{ instagramUserId: instagramId }, { email: email }],
  });
  if (userExists) {
    res.status(409);
    throw new Error("This account has already been registered. Please log in.");
  }

  const newUser = new User({
    firstName,
    lastName,
    email,
    password,
    instagramUserId: instagramId,
    instagramUsername: instagramUsername,
    instagramAccessToken: instagramAccessToken,
    isVerified: true,
    currentPlan: "free",
  });
  await newUser.save();

  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 90);
  const newSubscription = await Subscription.create({
    userId: newUser._id,
    plan: "free",
    status: "trial",
    amount: 0,
    billingCycle: "trial",
    startDate: new Date(),
    endDate: trialEndDate,
  });

  newUser.subscriptionId = newSubscription._id;
  await newUser.save();

  await Otp.deleteOne({ email });

  const finalToken = generateToken(newUser._id);
  res.status(201).json({
    message: "Registration complete. Welcome!",
    token: finalToken,
    user: {
      _id: newUser._id,
      name: `${newUser.firstName} ${newUser.lastName}`,
      email: newUser.email,
      instagramUserId: newUser.instagramUserId,
    },
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
    res.status(409).json({
      message:
        "An account with this email already exists. Please use a different email.",
    });
    return;
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
  res.status(200).json({
    message: "Email verified successfully. You can now set your password.",
  });
});
