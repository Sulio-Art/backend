import express from "express";
import {
  register,
  login,
  requestPasswordReset,
  resetPassword,
  logout,
  getMe,
  sendInstagramEmailOtp,
  verifyInstagramEmailOtp,
  loginWithInstagram,
  completeInstagramRegistration,
  sendVerificationOtp,
  verifyHeroOtp,
  checkEmailExists,
} from "../controller/auth.Controlller.js";
import {
  connectInstagramAccount,
  getInstagramProfile,
} from "../controller/instagram.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { verifyUserOtp } from "../controller/verifyOtp.controller.js";

const router = express.Router();

router.post("/send-verification-otp", sendVerificationOtp);
router.post("/verify-hero-otp", verifyHeroOtp);
router.post("/instagram/send-email-otp", sendInstagramEmailOtp);
router.post("/instagram/verify-email-otp", verifyInstagramEmailOtp);

router.post("/register", register);
router.post("/verify-otp", verifyUserOtp);
router.post("/login", login);
router.post("/logout", logout);
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password", resetPassword);

router.post("/instagram/login", loginWithInstagram);
router.post("/instagram/complete-registration", completeInstagramRegistration);
router.post("/check-email", checkEmailExists);

router.get("/me", protect, getMe);

router.post("/instagram/connect", protect, connectInstagramAccount);
router.get("/instagram/profile", protect, getInstagramProfile); 

export default router;