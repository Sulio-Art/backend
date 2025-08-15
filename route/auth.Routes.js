// backend/route/auth.Routes.js

import express from "express";
import {
  register,
  login,
  checkEmailExists,
  sendVerificationOtp,
  verifyHeroOtp,
  requestPasswordReset,
  verifyPasswordResetOtp, // <-- Import the new controller
  resetPassword,
  logout,
  getMe,
  finalizePreverifiedRegistration,
  completeInstagramRegistration,
  sendInstagramEmailOtp,
  verifyInstagramEmailOtp,
} from "../controller/auth.Controlller.js";
import {
  getInstagramAuthUrl,
  handleBusinessLogin,
  connectInstagramAccount,
} from "../controller/instagram.Controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// === Main Authentication Routes ===
router.post("/register", register);
router.post("/register/finalize", finalizePreverifiedRegistration);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", protect, getMe);

// === OTP and Verification Routes ===
router.post("/send-otp", sendVerificationOtp);
router.post("/verify-hero-otp", verifyHeroOtp);
router.post("/check-email", checkEmailExists);

// === Password Reset Routes ===
router.post("/request-password-reset", requestPasswordReset);
// --- NEW SECURE ROUTE ---
router.post("/verify-password-reset-otp", verifyPasswordResetOtp);
router.post("/reset-password", resetPassword);

// === Instagram Specific Routes ===
router.get("/instagram/auth-url", getInstagramAuthUrl);
router.post("/instagram/login", handleBusinessLogin);
router.post("/instagram/connect", protect, connectInstagramAccount);
router.post("/instagram/complete-registration", completeInstagramRegistration);
router.post("/instagram/send-instagram-email-otp", sendInstagramEmailOtp);
router.post("/instagram/verify-instagram-email-otp", verifyInstagramEmailOtp);

export default router;
