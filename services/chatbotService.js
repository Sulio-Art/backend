import axios from 'axios';
import Profile from "../model/profile.Model.js";
import User from "../model/user.model.js";

const CHATBOT_API_URL = process.env.CHATBOT_API_URL;

if (!CHATBOT_API_URL) {
  console.error("FATAL ERROR: CHATBOT_API_URL environment variable is not set.");
  process.exit(1); 
}

// This is our single, unified function that talks to the SIMPLE API at your URL.
// It is built to satisfy the server's demand for `query` and `system-prompt`.
const callSimpleChatAPI = async (systemPrompt, query) => {
  try {
    const { data } = await axios.post(
      CHATBOT_API_URL,
      {
        "system-prompt": systemPrompt, // Field 1 the server wants
        "query": query,             // Field 2 the server wants
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    // --- ROBUST RESPONSE HANDLING ---
    // The server sometimes returns a raw string, and sometimes an object.
    // This code handles both possibilities correctly.
    if (typeof data === 'string') {
      return data; // If the response is just text, return it directly.
    }
    if (data && typeof data.response === 'string') {
      return data.response; // If it's an object with a 'response' key, return that.
    }
    // This is a fallback for the complex Groq-like response, just in case.
    if (data?.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }
    
    // If we can't find the text in any expected format, we must report an error.
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

const PREDEFINED_SYSTEM_PROMPT = `You are an AI chatbot that helps an artist manage their users...`; // Your full predefined prompt

// This function prepares the data for the TEST CHAT.
export const getTestChatResponse = async (userSystemPrompt, conversationHistory) => {
  // 1. Flatten the previous conversation into a simple string to provide context.
  const historyAsString = conversationHistory
    .slice(0, -1) // Exclude the very last user message which will be the query
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n');

  // 2. Create the full system prompt by combining the base prompt, the user's setup, and the flattened history.
  const fullSystemPrompt = `${PREDEFINED_SYSTEM_PROMPT}${userSystemPrompt}\n\n--- Previous Conversation ---\n${historyAsString}`;

  // 3. Extract the most recent user message to use as the main "query".
  const lastUserMessage = conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1] : null;
  const query = lastUserMessage && lastUserMessage.role === 'user' ? lastUserMessage.content : "";

  if (!query) {
    // This can happen if the history is empty or ends with an assistant message.
    return "Please type a message to start the conversation.";
  }

  // 4. Call the unified API function with the data formatted correctly.
  return callSimpleChatAPI(fullSystemPrompt, query);
};

// This function prepares the data for the LIVE INSTAGRAM CHAT.
export const getLiveChatResponse = async (query, igid, task) => {
  const artist = await User.findOne({ instagramUserId: igid });
  if (!artist) {
    throw new Error(`No artist found for Instagram ID: ${igid}`);
  }

  const profile = await Profile.findOne({ userId: artist._id });
  const settingKey = `setup-${task.toLowerCase().replace(/\s+/g, "-")}`;
  const userSystemPrompt = profile?.chatbotSettings?.get(settingKey) || 
    "You are a helpful and friendly assistant for a talented artist. Be polite and concise.";

  // 1. Create the full system prompt.
  const fullSystemPrompt = PREDEFINED_SYSTEM_PROMPT + userSystemPrompt;

  // 2. Call the unified API function. The user's message is the query.
  const response = await callSimpleChatAPI(fullSystemPrompt, query);
  
  // 3. Return it in the format the handleChat controller expects.
  return { response, summary: "No summary available." }; 
};