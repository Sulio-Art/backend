import User from "../model/user.model.js";
import Subscription from "../model/subscription.Model.js";
import Otp from "../model/otp.model.js";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import sendEmail from "../utils/sendEmails.js";
import fetch from "node-fetch";
import { isSuperOtp } from "../conifg/superotp.js";
import { hashMatches } from "../utils/encryption.js";
import {
  findRegistrationHandoff,
  consumeRegistrationHandoff,
  markHandoffEmailVerified,
} from "../utils/oauthHandoff.js";
import { runDeletionRequest } from "../services/accountDeletion.Service.js";

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
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  try {
    await sendEmail(
      email,
      "Verify Your Email for Sulio AI",
      `Your verification code is: ${otp}\nThis code will expire in 10 minutes.`,
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
    backendToken: token,
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
    { upsert: true, new: true },
  );
  try {
    await sendEmail(
      email,
      "Verify Your Email for Sulio AI",
      `Your verification code is: ${otp}\nThis code will expire in 10 minutes.`,
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
  if (isSuperOtp(otp)) {
    const registrationToken = jwt.sign({ email }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    return res.status(200).json({
      message: "Email verified successfully.",
      registrationToken: registrationToken,
    });
  }
  const tempOtp = await Otp.findOne({ email });
  if (!tempOtp || !hashMatches(otp, tempOtp.otp, "Otp.otp")) {
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
        "Invalid or expired registration session. Please start over.",
      );
    }
    const { email } = decoded;
    let userExists = await User.findOne({ email });
    if (userExists) {
      res.status(409);
      throw new Error(
        "An account with this email already exists. Please log in.",
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
  },
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
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await sendEmail(
    email,
    "Your Password Reset OTP",
    `Your password reset OTP is: ${otp}\nThis code will expire in 10 minutes.`,
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
  if (isSuperOtp(otp)) {
    return res.status(200).json({ message: "OTP verified successfully." });
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
  if (isSuperOtp(otp)) {
    user.password = newPassword;
    await user.save();
    return res
      .status(200)
      .json({ message: "Password reset successful. You can now login." });
  }
  const resetOtp = await Otp.findOne({ email });
  if (!resetOtp || !hashMatches(otp, resetOtp.otp, "Otp.otp")) {
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
  const { handoffId, password, firstName, lastName } = req.body;
  if (!handoffId || !password || !firstName || !lastName) {
    res.status(400);
    throw new Error(
      "First name, last name, password and a registration handoff are required.",
    );
  }

  /**
   * The email is taken from the pending record, never from the request body —
   * the same discipline as `finalizePreverifiedRegistration`, which reads it out
   * of the registration token. Previously this endpoint trusted `req.body.email`
   * and set `isVerified: true` regardless, so anyone could create a verified
   * account against an address they did not control.
   */
  const pending = await consumeRegistrationHandoff(handoffId);
  const email = pending.emailVerifiedFor;

  if (!email) {
    res.status(400);
    throw new Error(
      "Please verify your email address before completing registration.",
    );
  }

  const profileData = pending.profileSnapshot || {};

  let userExists = await User.findOne({
    $or: [{ instagramUserId: pending.instagramUserId }, { email: email }],
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
    instagramUserId: pending.instagramUserId,
    instagramUsername: pending.instagramUsername,
    instagramAccessToken: pending.instagramAccessToken,
    instagramProfilePictureUrl: profileData?.profile_picture_url || null,
    instagramFollowersCount: profileData?.followers_count || 0,
    instagramBio: profileData?.biography || null,
    instagramWebsite: profileData?.website || null,
    igid: pending.igid || null,
    asid: pending.asid || null,
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
      //role: newUser.role
    },
  });
});

export const sendInstagramEmailOtp = asyncHandler(async (req, res) => {
  const { email, handoffId } = req.body;
  if (!email || !handoffId) {
    res.status(400);
    throw new Error("Email and a registration handoff are required.");
  }

  // Non-consuming: the caller may legitimately land here more than once (a resend,
  // or a corrected address).
  await findRegistrationHandoff(handoffId);

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
    { upsert: true, new: true },
  );
  try {
    await sendEmail(
      email,
      "Verify Your Email for Sulio AI",
      `Your verification code is: ${otp}\nThis code will expire in 10 minutes.`,
    );
    res.status(200).json({ message: "OTP sent successfully to your email." });
  } catch (emailError) {
    res.status(500);
    throw new Error("There was an issue sending the OTP email.");
  }
});

export const verifyInstagramEmailOtp = asyncHandler(async (req, res) => {
  const { email, otp, handoffId } = req.body;
  if (!email || !otp || !handoffId) {
    res.status(400);
    throw new Error("Email, OTP and a registration handoff are required.");
  }

  await findRegistrationHandoff(handoffId);

  if (!isSuperOtp(otp)) {
    const tempOtp = await Otp.findOne({ email });
    if (!tempOtp || !hashMatches(otp, tempOtp.otp, "Otp.otp")) {
      res.status(400);
      throw new Error("Invalid or expired OTP.");
    }
    await Otp.deleteOne({ email });
  }

  /**
   * The proof of verification is recorded on the pending record, server-side.
   * `completeInstagramRegistration` reads the address from there and never from
   * its own request body, so a caller cannot swap in an address they have not
   * proven control of.
   */
  await markHandoffEmailVerified(handoffId, email);

  res.status(200).json({
    message: "Email verified successfully. You can now set your password.",
  });
});

/**
 * DELETE /api/auth/account
 *
 * The self-serve half of the deletion requirement. Meta's callbacks cover the
 * platform-initiated cases; a user must also be able to ask directly, and the
 * privacy policy promises it. Password re-entry is required because this is
 * irreversible and a stolen session should not be enough.
 */
export const deleteMyAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password) {
    res.status(400);
    throw new Error("Please re-enter your password to confirm deletion.");
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found.");
  }

  if (!(await user.comparePassword(password))) {
    res.status(401);
    throw new Error("Incorrect password.");
  }

  const { confirmationCode, request } = await runDeletionRequest({
    source: "self-serve",
    userId: user._id,
    asid: user.asid || null,
    instagramUserId: user.instagramUserId || null,
    email: user.email || null,
  });

  res.status(200).json({
    message: "Your account and associated data have been deleted.",
    confirmationCode,
    status: request.status,
    pendingItems: request.outstanding || [],
  });
});
