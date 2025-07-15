import express from "express";
import {
  register,
  verifyOtp,
  login,
  requestPasswordReset,
  resetPassword,
  
  logout,
  getMe,
} from "../controller/auth.Controlller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/verify", verifyOtp);
router.post("/login", login);
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password", resetPassword);
router.post("/logout", logout);
router.get("/me", protect, getMe);

export default router;
