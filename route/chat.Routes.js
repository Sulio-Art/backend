import express from 'express';
import {
  handleChat,
  getChatHistory,
  saveChatbotSetting,
  handleTestChat,
  updateChatbotSettings,
} from "../controller/chat.Controller.js";
import { verifyInstagramToken } from "../middleware/verifyInstagramToken.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", verifyInstagramToken, handleChat);
router.get("/history", protect, getChatHistory);

// This old route can be kept or removed, but the new one is what the frontend uses
router.post("/settings", protect, saveChatbotSetting); 

// New route for efficiently updating all settings with RTK Query
router.patch("/settings", protect, updateChatbotSettings);

router.post("/test", protect, handleTestChat);

export default router;