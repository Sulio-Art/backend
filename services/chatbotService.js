import axios from 'axios';
import Profile from "../model/profile.Model.js";
import User from "../model/user.model.js";

const CHATBOT_API_URL = process.env.CHATBOT_API_URL;

if (!CHATBOT_API_URL) {
  console.error("FATAL ERROR: CHATBOT_API_URL environment variable is not set.");
  process.exit(1); 
}

const callSimpleChatAPI = async (systemPrompt, query) => {
  try {
    const { data } = await axios.post(
      CHATBOT_API_URL,
      {
        "system-prompt": systemPrompt,
        "query": query,            
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );


    if (typeof data === 'string') {
      return data;
    }
    if (data && typeof data.response === 'string') {
      return data.response; 
    }
    if (data?.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }
    
    console.error("Could not find a valid response string in API response body:", JSON.stringify(data, null, 2));
    throw new Error("Invalid or unexpected response structure from AI service.");

  } catch (error) {
    console.error("--- ERROR IN callSimpleChatAPI SERVICE ---");
    if (error.response) {
      console.error(`API Error Status: ${error.response.status}`);
      console.error('API Error Response Body:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Non-API Error:', error.message);
    }
    throw new Error("The AI assistant is currently unavailable due to a technical error.");
  }
};

const PREDEFINED_SYSTEM_PROMPT = `You are an AI chatbot that helps an artist manage their users...`; 
export const getTestChatResponse = async (userSystemPrompt, conversationHistory) => {
  const historyAsString = conversationHistory
    .slice(0, -1) 
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n');

  const fullSystemPrompt = `${PREDEFINED_SYSTEM_PROMPT}${userSystemPrompt}\n\n--- Previous Conversation ---\n${historyAsString}`;

  const lastUserMessage = conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1] : null;
  const query = lastUserMessage && lastUserMessage.role === 'user' ? lastUserMessage.content : "";

  if (!query) {
    return "Please type a message to start the conversation.";
  }

  return callSimpleChatAPI(fullSystemPrompt, query);
};

export const getLiveChatResponse = async (query, igid, task) => {
  const artist = await User.findOne({ instagramUserId: igid });
  if (!artist) {
    throw new Error(`No artist found for Instagram ID: ${igid}`);
  }

  const profile = await Profile.findOne({ userId: artist._id });
  const settingKey = `setup-${task.toLowerCase().replace(/\s+/g, "-")}`;
  const userSystemPrompt = profile?.chatbotSettings?.get(settingKey) || 
    "You are a helpful and friendly assistant for a talented artist. Be polite and concise.";

  const fullSystemPrompt = PREDEFINED_SYSTEM_PROMPT + userSystemPrompt;

  const response = await callSimpleChatAPI(fullSystemPrompt, query);
  
  return { response, summary: "No summary available." }; 
};