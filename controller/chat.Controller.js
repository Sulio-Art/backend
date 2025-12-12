import asyncHandler from "express-async-handler";
import Chat from "../model/chat.Model.js";
import User from "../model/user.model.js";
import Profile from "../model/profile.Model.js";
import TestChat from "../model/testChat.Model.js";
import {
  getTestChatResponse,
  getLiveChatResponse,
} from "../services/chatbotService.js";
import { updateChatbotSettingsForUser } from "../services/profile.Service.js";

// Bypass limit for testing
const checkAndDecrementQueries = async (user) => {
  return;
};

export const handleTestChat = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { messages, activeStep, conversationId } = req.body;

  if (!messages || !Array.isArray(messages) || !activeStep || !conversationId) {
    res.status(400);
    throw new Error("Missing required fields.");
  }

  // 1. Basic User/Profile Validation
  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found.");
  }
  await checkAndDecrementQueries(user);

  const profile = await Profile.findOne({ userId });
  if (!profile) {
    res.status(404);
    throw new Error("User profile not found.");
  }

  // 2. Determine the DB Key (e.g., "Setup Greetings" -> "setup-greetings")
  const dbKey = activeStep.toLowerCase().replace(/\s+/g, "-");

  // 3. Get Existing Settings to give context to AI
  let currentSetting = "You are a helpful assistant.";
  if (
    profile.chatbotSettings &&
    typeof profile.chatbotSettings.get === "function"
  ) {
    const stored = profile.chatbotSettings.get(dbKey);
    if (stored) currentSetting = stored;
  }

  // 4. Get AI Response (Returns JSON String)
  // Note: We pass activeStep to the service now
  let aiRawResponse = await getTestChatResponse(
    currentSetting,
    messages,
    activeStep
  );

  let finalUserResponse = aiRawResponse; // Default to raw if parsing fails

  // 5. PARSE & SAVE LOGIC
  try {
    const parsed = JSON.parse(aiRawResponse);

    // A. Extract the message for the user
    if (parsed.response) {
      finalUserResponse = parsed.response;
    }

    // B. Extract and SAVE the database update
    if (parsed.database_update && parsed.database_update.trim().length > 0) {
      console.log(`[AUTO-SAVE] Updating ${dbKey}:`, parsed.database_update);

      // Use MongoDB $set with dynamic key path
      const updatePath = `chatbotSettings.${dbKey}`;
      await Profile.updateOne(
        { userId: userId },
        { $set: { [updatePath]: parsed.database_update } }
      );
    }
  } catch (e) {
    console.log("Response was not JSON, skipping auto-save.");
  }

  // 6. Save Chat History to DB
  const userMessage = messages.filter((msg) => msg.role === "user").pop();
  if (userMessage && finalUserResponse) {
    const assistantMessage = { role: "assistant", content: finalUserResponse };
    await TestChat.findOneAndUpdate(
      { conversationId, userId },
      {
        $push: { messages: { $each: [userMessage, assistantMessage] } },
        $setOnInsert: { userId, conversationId, activeStep },
      },
      { upsert: true, new: true }
    );
  }

  // 7. Respond to Frontend (Clean text only)
  res.status(200).json({ response: finalUserResponse });
});

export const handleChat = asyncHandler(async (req, res) => {
  const { query, task } = req.body;
  const igid = req.igid;

  if (!query || !igid || !task) {
    res.status(400);
    throw new Error("All fields are required");
  }

  const artist = await User.findOne({ instagramUserId: igid });
  if (!artist) {
    res.status(404);
    throw new Error("No artist is configured for this Instagram account.");
  }
  await checkAndDecrementQueries(artist);

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

export const updateChatbotSettings = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const newSettings = req.body;
  const updatedSettings = await updateChatbotSettingsForUser(
    userId,
    newSettings
  );
  res.status(200).json({
    message: "Chatbot settings updated successfully.",
    chatbotSettings: updatedSettings,
  });
});
