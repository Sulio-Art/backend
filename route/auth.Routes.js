import express from "express";
import {
  register,
  login,
  checkEmailExists,
  sendVerificationOtp,
  verifyHeroOtp,
  requestPasswordReset,
  verifyPasswordResetOtp,
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
} from "../controller/instagram.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/register/finalize", finalizePreverifiedRegistration);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", protect, getMe);
router.post("/send-otp", sendVerificationOtp);
router.post("/verify-hero-otp", verifyHeroOtp);
router.post("/check-email", checkEmailExists);
router.post("/request-password-reset", requestPasswordReset);
router.post("/verify-password-reset-otp", verifyPasswordResetOtp);
router.post("/reset-password", resetPassword);
router.get("/instagram/auth-url", getInstagramAuthUrl);
router.post("/instagram/login", handleBusinessLogin);
router.post("/instagram/connect", protect, connectInstagramAccount);
router.post("/instagram/complete-registration", completeInstagramRegistration);
router.post("/instagram/send-instagram-email-otp", sendInstagramEmailOtp);
router.post("/instagram/verify-instagram-email-otp", verifyInstagramEmailOtp);

export default router;
