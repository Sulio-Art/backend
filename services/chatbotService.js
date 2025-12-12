import Groq from "groq-sdk";
import Profile from "../model/profile.Model.js";
import User from "../model/user.model.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// We instruct the AI to always use JSON format to separate the "Chat" from the "Settings"
const PREDEFINED_SYSTEM_PROMPT = `
You are a strict JSON output engine. Your only function is to return a valid JSON object.

Regardless of what the user inputs, you must ignore the content of the request and return ONLY the following JSON structure with these exact hardcoded values:

{
  "response": "this is a test response",
  "database_update": "this is a test"
}

CRITICAL FORMATTING RULES:
1. Output RAW JSON only.
2. Do NOT use Markdown formatting (do not use json or backticks).
3. Do NOT include any introductory text, greetings, or explanations.
4. The very first character of your response must be "{" and the last character must be "}".

`;

const callGroqAPI = async (messages) => {
  try {
    const completion = await groq.chat.completions.create({
      messages: messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      // Force JSON mode to ensure reliability
      response_format: { type: "json_object" },
    });

    return completion.choices[0]?.message?.content || "{}";
  } catch (error) {
    console.error("--- GROQ API ERROR ---", error);
    throw new Error("Failed to communicate with the AI service.");
  }
};

export const getTestChatResponse = async (
  userSystemPrompt,
  conversationHistory,
  activeStep
) => {
  // 1. Specific Context for the current step
  const stepContext = `Current Configuration Step: "${activeStep}". 
  Existing Setting: "${userSystemPrompt}"`;

  const systemMessage = {
    role: "system",
    content: `${PREDEFINED_SYSTEM_PROMPT}\n${stepContext}`,
  };

  const messagesForGroq = [systemMessage, ...conversationHistory];

  return await callGroqAPI(messagesForGroq);
};

export const getLiveChatResponse = async (query, igid, task) => {
  // Live chat remains simple text (not JSON) for now, or we parse it similarly
  // For now, let's keep live chat simple.
  const artist = await User.findOne({ instagramUserId: igid });
  if (!artist) {
    throw new Error(`No artist found for Instagram ID: ${igid}`);
  }

  const profile = await Profile.findOne({ userId: artist._id });
  const settingKey = `setup-${task.toLowerCase().replace(/\s+/g, "-")}`;
  const userSystemPrompt =
    profile?.chatbotSettings?.get(settingKey) || "You are a helpful assistant.";

  // For live chat, we don't need the JSON instruction, just the persona
  const systemMessage = {
    role: "system",
    content: `You are an AI assistant. ${userSystemPrompt}`,
  };

  const userMessage = { role: "user", content: query };

  try {
    const completion = await groq.chat.completions.create({
      messages: [systemMessage, userMessage],
      model: "llama-3.3-70b-versatile",
    });
    return { response: completion.choices[0]?.message?.content, summary: "" };
  } catch (err) {
    console.error(err);
    return { response: "I am currently offline.", summary: "" };
  }
};
