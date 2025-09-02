import Chat from '../model/chat.Model.js';
import User from "../model/user.model.js";
import Profile from "../model/profile.Model.js";
import { callChatbot, callApiForTest } from "../services/chatbotService.js";

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


export const handleTestChat = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messages, activeStep } = req.body;

    if (!messages || !Array.isArray(messages) || !activeStep) {
      return res
        .status(400)
        .json({ message: "A message history array and activeStep are required." });
    }

    const profile = await Profile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ message: "User profile not found." });
    }

    const settingKey = activeStep.toLowerCase().replace(/\s+/g, "-");
    
    const userSystemPrompt = profile.chatbotSettings.get(settingKey) ||
      "You are a helpful and friendly assistant for a talented artist. Be polite and concise.";

    const responseContent = await callApiForTest(userSystemPrompt, messages);

    res.status(200).json({ response: responseContent });

  } catch (error) {
    console.error("Handle Test Chat Error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

export const updateChatbotSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const newSettings = req.body; 

    if (!newSettings || typeof newSettings !== 'object') {
      return res.status(400).json({ message: "Invalid settings format provided." });
    }

    const profile = await Profile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({ message: "Profile not found." });
    }

    Object.keys(newSettings).forEach(key => {
      profile.chatbotSettings.set(key, newSettings[key]);
    });

    await profile.save();
    
    const updatedSettingsObject = Object.fromEntries(profile.chatbotSettings);

    res.status(200).json({
      message: "Chatbot settings updated successfully.",
      chatbotSettings: updatedSettingsObject,
    });

  } catch (error) {
    console.error("Update Chatbot Settings Error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

export const saveChatbotSetting = async (req, res) => {
  try {
    const userId = req.user.id;
    const { setting, value } = req.body;

    if (!setting || value === undefined) {
      return res
        .status(400)
        .json({ message: "Setting and value are required." });
    }

    const profile = await Profile.findOneAndUpdate(
      { userId },
      { $set: { userId } }, 
      { upsert: true, new: true }
    );
    
    const settingKey = setting.toLowerCase().replace(/\s+/g, "-");

    profile.chatbotSettings.set(settingKey, value);
    profile.isChatbotConfigured = true;

    await profile.save();

    res
      .status(200)
      .json({ message: `Setting '${setting}' saved successfully.` });
  } catch (error) {
    console.error("Save Chatbot Setting Error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};