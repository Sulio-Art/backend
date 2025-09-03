import express from 'express';
import {
  handleChat,
  getChatHistory,
  handleTestChat,
  updateChatbotSettings,
  // Imports for get/saveTestChatHistory are removed
} from "../controller/chat.Controller.js";
import { verifyInstagramToken } from "../middleware/verifyInstagramToken.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", verifyInstagramToken, handleChat);
router.get("/history", protect, getChatHistory);
router.patch("/settings", protect, updateChatbotSettings);
router.post("/test", protect, handleTestChat);

// The routes for /test/history have been deleted.

export default router;