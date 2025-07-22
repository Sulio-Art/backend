import jwt from 'jsonwebtoken';
import User from '../model/user.model.js';
import asyncHandler from 'express-async-handler';

export const verifyUserOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    console.log('[BACKEND]: Received OTP verification request for:', email);

    const user = await User.findOne({ email });

    if (!user) {
        res.status(404);
        throw new Error("User not found.");
    }

    // In a production app, you would compare user.otp with the provided otp.
    // For now, we are just checking for the presence and format.
    if (!otp || otp.length !== 6) {
        res.status(400);
        throw new Error("Invalid OTP format.");
    }

    user.isVerified = true;
    user.otp = undefined; // Clear the OTP after successful verification
    user.otpExpires = undefined;
    await user.save();

    // Create JWT with user ID in the payload
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { 
        expiresIn: process.env.JWT_EXPIRES_IN || '7d' 
    });

    console.log('[BACKEND]: OTP verified. User marked as verified. Sending JWT.');
    res.status(200).json({ token });
});