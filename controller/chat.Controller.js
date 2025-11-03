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

// A helper function to manage query logic for any user
const checkAndDecrementQueries = async (user) => {
  const MONTHLY_PLAN_QUERY_LIMITS = {
    free: 10,
    plus: 30,
    premium: 100,
    pro: Infinity,
  };
  const YEARLY_PLAN_QUERY_LIMITS = {
    free: 120,
    plus: 360,
    premium: 1200,
    pro: Infinity,
  };

  const now = new Date();

  if (user.billingCycle === "yearly") {
    const limit = YEARLY_PLAN_QUERY_LIMITS[user.currentPlan] || 120;
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    if (user.queryCountResetAt < oneYearAgo) {
      user.yearlyQueriesRemaining = limit;
      user.queryCountResetAt = now;
      await user.save();
    }

    if (user.yearlyQueriesRemaining <= 0) {
      throw new Error(
        `You have no remaining queries for this year. Your plan will reset on the anniversary of your subscription.`
      );
    }

    await User.updateOne(
      { _id: user._id },
      { $inc: { yearlyQueriesRemaining: -1 } }
    );
  } else {
    const limit = MONTHLY_PLAN_QUERY_LIMITS[user.currentPlan] || 10;
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );

    if (user.queryCountResetAt < startOfMonth) {
      user.monthlyQueriesRemaining = limit;
      user.queryCountResetAt = now;
      await user.save();
    }

    if (user.monthlyQueriesRemaining <= 0) {
      throw new Error(
        `You have no remaining queries for this month. Please upgrade your plan for more.`
      );
    }

    await User.updateOne(
      { _id: user._id },
      { $inc: { monthlyQueriesRemaining: -1 } }
    );
  }
};

export const handleTestChat = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { messages, activeStep, conversationId } = req.body;

  if (!messages || !Array.isArray(messages) || !activeStep || !conversationId) {
    res.status(400);
    throw new Error(
      "A message history, activeStep, and conversationId are required."
    );
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found.");
  }

  try {
    await checkAndDecrementQueries(user);
  } catch (error) {
    res.status(403);
    throw new Error(error.message);
  }

  const profile = await Profile.findOne({ userId });
  if (!profile) {
    res.status(404);
    throw new Error("User profile not found.");
  }

  const settingKey = activeStep.toLowerCase().replace(/\s+/g, "-");
  const userSystemPrompt =
    profile.chatbotSettings.get(settingKey) || "You are a helpful assistant.";

  const responseContent = await getTestChatResponse(userSystemPrompt, messages);

  const userMessage = messages.filter((msg) => msg.role === "user").pop();

  if (userMessage && responseContent) {
    const assistantMessage = { role: "assistant", content: responseContent };
    await TestChat.findOneAndUpdate(
      { conversationId, userId },
      {
        $push: { messages: { $each: [userMessage, assistantMessage] } },
        $setOnInsert: { userId, conversationId, activeStep },
      },
      { upsert: true, new: true }
    );
  }

  res.status(200).json({ response: responseContent });
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

  try {
    await checkAndDecrementQueries(artist);
  } catch (error) {
    res.status(403);
    throw new Error(error.message);
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

// --- THIS IS THE FUNCTION WITH LOGGING ADDED ---
export const updateChatbotSettings = asyncHandler(async (req, res) => {
  // --- BACKEND LOG 3 ---
  console.log(
    "[BACKEND-CONTROLLER-DEBUG] 3. updateChatbotSettings endpoint hit."
  );
  console.log("[BACKEND-CONTROLLER-DEBUG] 4. Request body received:", req.body);

  const userId = req.user.id;
  const newSettings = req.body;

  if (
    !newSettings ||
    typeof newSettings !== "object" ||
    Object.keys(newSettings).length === 0
  ) {
    res.status(400);
    throw new Error("Invalid or empty settings format provided.");
  }

  // --- BACKEND LOG 5 ---
  console.log(
    "[BACKEND-CONTROLLER-DEBUG] 5. Calling the profile service to update settings..."
  );
  const updatedSettings = await updateChatbotSettingsForUser(
    userId,
    newSettings
  );

  // --- BACKEND LOG 10 ---
  console.log(
    "[BACKEND-CONTROLLER-DEBUG] 10. Profile service finished. Sending response to client."
  );

  res.status(200).json({
    message: "Chatbot settings updated successfully.",
    chatbotSettings: updatedSettings,
  });
});
