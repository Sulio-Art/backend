import Chat from '../model/chat.Model.js';
import User from "../model/user.model.js";
import { callChatbot } from "../services/chatbotService.js";

const PLAN_QUERY_LIMITS = {
  free: 10,
  basic: 10,
  trial_expired: 10,
  plus: 30,
  premium: 100,
  pro: Infinity,
};

export const handleChat = async (req, res) => {
  try {
    const { query, task } = req.body;
    const igid = req.igid;

    if (!query || !igid || !task) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const artist = await User.findOne({ instagramUserId: igid });

    if (!artist) {
      return res
        .status(404)
        .json({ error: "No artist is configured for this Instagram account." });
    }

    const userPlan = artist.currentPlan || "free";
    const limit = PLAN_QUERY_LIMITS[userPlan] || 10;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const queriesThisMonth = await Chat.countDocuments({
      userId: artist._id,
      createdAt: { $gte: startOfMonth },
    });

    if (queriesThisMonth >= limit) {
      return res.status(403).json({
        error:
          "Query limit exceeded for this artist. Please ask them to upgrade their plan.",
      });
    }

    const chatbotResponse = await callChatbot(query, igid, task);

    const newChat = new Chat({
      userId: artist._id,
      query,
      igid,
      task,
      response: chatbotResponse.response,
      summary: chatbotResponse.summary,
    });

    await newChat.save();

    res.status(201).json(newChat);
  } catch (error) {
    console.error("Handle Chat Error:", error.message);
    res.status(500).json({ error: "Server Error" });
  }
};

export const getChatHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const chatHistory = await Chat.find({ userId }).sort({ createdAt: -1 });

    if (!chatHistory.length) {
      return res
        .status(404)
        .json({ message: "No chat history found for your account" });
    }

    res.status(200).json({ chatHistory });
  } catch (error) {
    console.error("Error fetching chat history:", error.message);
    res
      .status(500)
      .json({ error: "Error fetching chat history", message: error.message });
  }
};