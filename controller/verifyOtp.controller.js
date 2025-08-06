import jwt from 'jsonwebtoken';
import User from '../model/user.model.js';
import asyncHandler from 'express-async-handler';

export const verifyUserOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      res.status(404);
      throw new Error("User not found.");
    }

    if (user.otp !== otp || user.otpExpires < Date.now()) {
      res.status(400);
      throw new Error("Invalid or expired OTP.");
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });

    res.status(200).json({
      message: "Account verified successfully! Logging you in...",
      token,
      user: {
        _id: user._id,
        email: user.email,
      },
    });
});