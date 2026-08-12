import mongoose from 'mongoose';
import { applyFieldEncryption } from "../conifg/encryptedFields.js";

const chatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    query: { type: String, required: true },
    igid: { type: String, required: true },
    task: { type: String, required: true },
    response: { type: String },
    summary: { type: String },
  },
  { timestamps: true }
);

chatSchema.index({ userId: 1, createdAt: -1 });

applyFieldEncryption(chatSchema, "Chat");

export default mongoose.models.Chat || mongoose.model('Chat', chatSchema);