import axios from 'axios';
import Profile from "../model/profile.Model.js";
import User from "../model/user.model.js";

const CHATBOT_API_URL = process.env.CHATBOT_API_URL;

const PREDEFINED_SYSTEM_PROMPT = `You are an AI chatbot that helps an artist manage their users.
Your task is to reply to the users that chat with the artist.
You will act and respond as if you ARE the artist. Only in extreme cases, if you are specifically and repeatedly asked about being an an AI, should you disclose your identity.

You will be provided with specific instructions from the artist on how to respond. These instructions will be appended below and may include:

- Greetings: How to greet the user at the start of the conversation.
- Background: Information about the artist's life, style, and how they talk.
- Other specific topics like handling commissions, questions about damaged artwork, etc.

There can be instances where this specific information is not provided by the artist for a particular topic. In such cases, you must remain in character as the artist, be polite, professional, and helpful. If you cannot answer a question, politely state that you will get back to them soon.

Adhere strictly to the artist's instructions that follow.
---
ARTIST'S INSTRUCTIONS:
`;

export const callApiForTest = async (userSystemPrompt, conversationHistory) => {
  try {
    // The system message now combines the predefined text and the artist's input
    const systemMessage = {
      role: "system",
      content: PREDEFINED_SYSTEM_PROMPT + userSystemPrompt,
    };

    const fullMessages = [systemMessage, ...conversationHistory];

    console.log("Sending POST request to:", CHATBOT_API_URL);
    
    const { data } = await axios.post(
      CHATBOT_API_URL,
      {
        messages: fullMessages,
        model: "llama-3.3-70b-versatile",
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const responseContent = data.choices[0]?.message?.content;
    
    if (!responseContent) {
        console.error("Could not find content in API response:", JSON.stringify(data, null, 2));
        return "Sorry, I received an unexpected response from the AI service."
    }
    
    return responseContent;

  } catch (error) {
    console.error("Error in callApiForTest service:", error.message);
    if (error.response) {
      console.error('API Error Response:', error.response.data);
    }
    return "The AI assistant is currently unavailable due to a technical error.";
  }
};


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