import axios from 'axios';
import Profile from "../model/profile.Model.js";
import User from "../model/user.model.js";

const CHATBOT_API_URL = process.env.CHATBOT_API_URL;

export const callChatbot = async (query, igid, task) => {
  try {
    const artist = await User.findOne({ instagramUserId: igid });
    if (!artist) {
      throw new Error(`No artist found for Instagram ID: ${igid}`);
    }

    const profile = await Profile.findOne({ userId: artist._id });

    const settingKey = `setup-${task.toLowerCase().replace(/\s+/g, "-")}`;

    let systemPrompt = profile?.chatbotSettings?.get(settingKey);

    if (!systemPrompt) {
      systemPrompt =
        "You are a helpful and friendly assistant for a talented artist. Be polite and concise.";
      console.log(`No custom prompt for task '${task}'. Using default prompt.`);
    }

    console.log(`Calling Hugging Face API for task '${task}'...`);
    const { data } = await axios.post(
      CHATBOT_API_URL,
      {
        query: query,
        "system-prompt": systemPrompt,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return {
      response:
        data.response || "I am sorry, I could not find an answer to that.",
      summary: data.summary || "No summary provided.",
    };
  } catch (error) {
    console.error("Error in callChatbot service:", error.message);
    return {
      response:
        "The artist's AI assistant is currently unavailable. Please try again later.",
      summary: "Service error.",
    };
  }
};