import mongoose from "mongoose";
import { applyFieldEncryption } from "../conifg/encryptedFields.js";

const chatLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  messages: [
    {
      role: { type: String, enum: ["user", "bot"], required: true },
      text: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
    },
  ],
});

applyFieldEncryption(chatLogSchema, "ChatLog");

export default mongoose.model("ChatLog", chatLogSchema);
