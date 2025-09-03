import asyncHandler from "express-async-handler";
import Chat from '../model/chat.Model.js';
import User from "../model/user.model.js";
import Profile from "../model/profile.Model.js";
import { getTestChatResponse, getLiveChatResponse } from "../services/chatbotService.js";
import { updateChatbotSettingsForUser } from "../services/profile.Service.js";


export const handleChat = asyncHandler(async (req, res) => {
  const { query, task } = req.body;
  const igid = req.igid;

  if (!query || !igid || !task) {
    res.status(400); throw new Error("All fields are required");
  }
  
  const PLAN_QUERY_LIMITS = {
    free: 10,
    basic: 10,
    trial_expired: 10,
    plus: 30,
    premium: 100,
    pro: Infinity,
  };

  const artist = await User.findOne({ instagramUserId: igid });
  if (!artist) {
    res.status(404);
    throw new Error("No artist is configured for this Instagram account.");
  }

  const userPlan = artist.currentPlan || "free";
  const limit = PLAN_QUERY_LIMITS[userPlan] || 10;
  
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const queriesThisMonth = await Chat.countDocuments({
    userId: artist._id,
    createdAt: { $gte: startOfMonth },
  });

  if (queriesThisMonth >= limit) {
    res.status(403);
    throw new Error("Query limit exceeded for this artist. Please ask them to upgrade their plan.");
  }

  const chatbotResponse = await getLiveChatResponse(query, igid, task);

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
});

export const getChatHistory = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const chatHistory = await Chat.find({ userId }).sort({ createdAt: -1 });
  res.status(200).json({ chatHistory: chatHistory || [] });
});

export const handleTestChat = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { messages, activeStep } = req.body;

  if (!messages || !Array.isArray(messages) || !activeStep) {
    res.status(400); throw new Error("A message history array and activeStep are required.");
  }

  const profile = await Profile.findOne({ userId });
  if (!profile) {
    res.status(404); throw new Error("User profile not found.");
  }

  const settingKey = activeStep.toLowerCase().replace(/\s+/g, "-");
  const userSystemPrompt = profile.chatbotSettings.get(settingKey) || "You are a helpful assistant.";
  
  const responseContent = await getTestChatResponse(userSystemPrompt, messages);
  
  res.status(200).json({ response: responseContent });
});

export const updateChatbotSettings = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const newSettings = req.body; 

  if (!newSettings || typeof newSettings !== 'object' || Object.keys(newSettings).length === 0) {
    res.status(400);
    throw new Error("Invalid or empty settings format provided.");
  }

  const updatedSettings = await updateChatbotSettingsForUser(userId, newSettings);

  res.status(200).json({
    message: "Chatbot settings updated successfully.",
    chatbotSettings: updatedSettings,
  });
});
