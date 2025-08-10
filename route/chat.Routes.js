import express from 'express';
import {
  handleChat,
  getChatHistory,
  saveChatbotSetting,
} from "../controller/chat.Controller.js";
import { verifyInstagramToken } from "../middleware/verifyInstagramToken.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", verifyInstagramToken, handleChat);
router.get("/history", protect, getChatHistory);
router.post("/settings", protect, saveChatbotSetting);

export default router;
