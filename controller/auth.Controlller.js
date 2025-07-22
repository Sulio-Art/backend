import User from "../model/user.model.js";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import sendEmail from "../utils/sendEmails.js"; // Import the email utility

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { 
    expiresIn: process.env.JWT_EXPIRES_IN || '7d' 
  });
};

export const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phoneNumber, password } = req.body;
  console.log('[BACKEND]: Received registration request for:', email);

  let user = await User.findOne({ email });
  if (user) {
    res.status(400);
    throw new Error('User already exists');
  }

  // Generate a real OTP
  const otp = crypto.randomInt(100000, 999999).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // OTP is valid for 10 minutes

  user = new User({ 
    firstName, 
    lastName, 
    email, 
    phoneNumber, 
    password, 
    otp, 
    otpExpires 
  });
  
  await user.save();

  // Send the OTP to the user's email
  try {
    await sendEmail(email, 'Verify Your Email for Sulio AI', `Your verification OTP is: ${otp}\nThis code will expire in 10 minutes.`);
    console.log(`[BACKEND]: OTP sent to ${email}`);
    res.status(201).json({ message: 'Registration successful. An OTP has been sent to your email.' });
  } catch (emailError) {
    console.error(`[BACKEND]: Failed to send OTP email to ${email}.`);
    // Even if email fails, the user is still created. They can request another OTP.
    res.status(201).json({ message: 'Registration successful, but failed to send OTP email. Please try verifying later.' });
  }
});

export const login = asyncHandler(async (req, res) => {
  // ... login function remains the same ...
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

  await sendEmail(email, 'Your Password Reset OTP', `Your password reset OTP is: ${otp}\nThis code will expire in 10 minutes.`);

  res.status(200).json({ message: "OTP for password reset sent to your email." });
});

// ... other functions (resetPassword, logout, getMe) remain the same ...
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

    res.status(200).json({ message: "Password reset successful. You can now login." });
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
    const user = await User.findById(req.user.id).select("-password");

    if (user) {
        res.status(200).json({
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phoneNumber: user.phoneNumber,
            },
        });
    } else {
        res.status(404);
        throw new Error("User not found");
    }
});