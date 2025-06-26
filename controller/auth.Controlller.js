import User from '../model/user.model.js';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import sendEmail from '../utils/sendEmails.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

export const register = asyncHandler(async (req, res) => {
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

  await sendEmail(email, 'Verify Your Email', `Your OTP is ${otp}`);

  res.status(201).json({
    message: 'User registered successfully. OTP sent to email for verification.',
  });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email });
  if (!user) throw new Error('User not found');
console.log(user.otp, otp);
  if (user.otp !== otp || user.otpExpires < Date.now()) {
    throw new Error('Invalid or expired OTP');
  }

  user.isVerified = true;
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();

  res.status(200).json({ message: 'Email verified successfully' });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user || !(await user.comparePassword(password))) {
    throw new Error('Invalid email or password');
  }

  if (!user.isVerified) {
    throw new Error('Email not verified. Please verify with OTP first.');
  }

  res.status(200).json({
    message: 'Login successful',
    token: generateToken(user._id),
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
    },
  });
});


export const requestPasswordReset = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
  
    if (!user) throw new Error('No user found with this email');
  
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();
  
    await sendEmail(email, 'Password Reset OTP', `Your password reset OTP is: ${otp}`);
  
    res.status(200).json({ message: 'OTP sent to your email for password reset' });
  });
  
  export const resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email });
  
    if (!user) throw new Error('User not found');
    if (user.otp !== otp || user.otpExpires < Date.now()) {
      throw new Error('Invalid or expired OTP');
    }
  
    user.password = newPassword;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();
  
    res.status(200).json({ message: 'Password reset successful. You can now login.' });
  });
  