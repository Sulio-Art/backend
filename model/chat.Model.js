import mongoose from 'mongoose';

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

export default mongoose.models.Chat || mongoose.model('Chat', chatSchema);