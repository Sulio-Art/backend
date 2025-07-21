import User from "../model/user.model.js";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import crypto from "crypto";
// import sendEmail from '../utils/sendEmails.js'; // Email service commented out for now

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// =================================================================
//  DEVELOPMENT-MODE REGISTER FUNCTION
// =================================================================
export const register = asyncHandler(async (req, res) => {
  console.log("REGISTER_DEV_MODE:", req.body);
  const { firstName, lastName, email, phoneNumber, password } = req.body;

  const existingUser = await User.findOne({
    $or: [{ email }, { phoneNumber }],
  });
  if (existingUser) {
    res.status(400);
    throw new Error("User already exists with this email or phone number");
  }

  const user = await User.create({
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    isVerified: true, // Automatically verify the user
  });

  res.status(201).json({
    message: "DEV MODE: User registered and verified successfully.",
    user: {
      id: user._id,
      firstName: user.firstName,
      email: user.email,
    },
  });
});

/*
// =================================================================
//  --- PRODUCTION-MODE REGISTER FUNCTION (Commented Out) ---
// =================================================================
export const register = asyncHandler(async (req, res) => {
  console.log(req.body)
  const { firstName, lastName, email, phoneNumber, password } = req.body;

  const existingUser = await User.findOne({ $or: [{ email }, { phoneNumber }] });
  if (existingUser) {
    throw new Error('User already exists with this email or phone number');
  }

  const otp = crypto.randomInt(100000, 999999).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); 

  const user = await User.create({
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    otp,
    otpExpires,
  });

  // The line below requires a working email service
  // await sendEmail(email, 'Verify Your Email', `Your OTP is ${otp}`);

  res.status(201).json({
    message: 'User registered successfully. OTP sent to email for verification.',
  });
});
*/

// =================================================================
//  DEVELOPMENT-MODE VERIFY OTP FUNCTION
// =================================================================
export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email) {
    res.status(400);
    throw new Error("Email is required");
  }

  const user = await User.findOne({ email });

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // In our dev mode, the user is created with `isVerified: true`.
  // So, if we find a user who is already verified, we simply
  // send a success response and do nothing else.
  if (user.isVerified) {
    console.log(
      "DEV MODE: User is already verified. Verification successful by default."
    );
    res.status(200).json({ message: "Email verified successfully (dev mode)" });
    return; // Stop execution here.
  }
});

/*
// =================================================================
//  --- PRODUCTION-MODE VERIFY OTP FUNCTION (Commented Out) ---
// =================================================================
export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  console.log("Verifying OTP for email:", email);
  console.log("Received OTP:", otp);

  if(!email){
    res.status(400);
    throw new Error('Email is required')
  }

  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error('User not found')
  };

  if (user.otp !== String(otp) || user.otpExpires < Date.now()) {
    res.status(400);
    throw new Error('Invalid or expired OTP');
  }

  user.isVerified = true;
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();

  res.status(200).json({ message: 'Email verified successfully' });
});
*/

// =================================================================
//  LOGIN, LOGOUT, AND PASSWORD RESET (No changes needed)
// =================================================================
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    res.status(401);
    throw new Error("Invalid email or password");
  }

  if (!user.isVerified) {
    res.status(401);
    throw new Error("Email not verified. Please verify with OTP first.");
  }

  const token = generateToken(user._id);

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({
    message: "Login successful",
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
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

  // This part is for password reset, which is separate from registration OTP
  // For now, we'll log it to the console instead of emailing it.
  console.log(`PASSWORD RESET OTP for ${email}: ${otp}`);
  // await sendEmail(email, 'Password Reset OTP', `Your password reset OTP is: ${otp}`);

  res
    .status(200)
    .json({ message: "DEV MODE: OTP for password reset logged to console." });
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
  console.log("Server: Clearing cookie and logging out user.");
  res.cookie("token", "", {
    httpOnly: true,
    expires: new Date(0), // Set expiration date to the past to delete it
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.status(200).json({ message: "Logged out successfully" });
});
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");

  if (user) {
    // FIX: Respond with the same nested structure as the login endpoint
    // and include the user's role.
    res.status(200).json({
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role, // <-- The crucial missing piece
        createdAt: user.createdAt,
      },
    });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});


