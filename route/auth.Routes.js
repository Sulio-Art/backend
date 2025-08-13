import express from "express";
import {
  register,
  login,
  checkEmailExists,
  sendVerificationOtp,
  verifyHeroOtp,
  sendInstagramEmailOtp,
  verifyInstagramEmailOtp,
  completeInstagramRegistration,
  requestPasswordReset,
  resetPassword,
  logout,
  getMe,
} from "../controller/auth.Controlller.js";
import { protect } from "../middleware/auth.middleware.js";
import { handleBusinessLogin } from "../controller/instagram.Controller.js";

const router = express.Router();

// Existing Auth Routes
router.post("/register", register);
router.post("/login", login);
router.post("/check-email", checkEmailExists);
router.post("/send-otp", sendVerificationOtp);
router.post("/verify-hero-otp", verifyHeroOtp);
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password", resetPassword);
router.post("/logout", logout);
router.get("/me", protect, getMe); // Added 'protect' middleware to secure this route

// Instagram Specific Routes
router.post("/instagram/login", handleBusinessLogin);
router.post("/instagram/complete-registration", completeInstagramRegistration);
router.post("/instagram/send-instagram-email-otp", sendInstagramEmailOtp);
router.post("/instagram/verify-instagram-email-otp", verifyInstagramEmailOtp);

export default router;