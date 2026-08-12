import mongoose from 'mongoose';
import { applyFieldEncryption } from "../conifg/encryptedFields.js";

const artworkPhotoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    public_id: { type: String, required: true },
  },
  { _id: false }
);

const diaryEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    // These three are encrypted at rest, so the schema cannot enforce a length:
    // validators run after the pre-save hook and would measure the ciphertext,
    // which is far longer than the plaintext. The limits are enforced on the
    // plaintext in dailyDiary.Controller.js instead.
    subject: {
      type: String,
    },
    description: {
      type: String,
    },
    studioLife: {
      type: String,
    },

    artworkPhotos: {
      type: [artworkPhotoSchema],
      default: [],
    },
  },
  { timestamps: true }
);

applyFieldEncryption(diaryEntrySchema, "DiaryEntry");

export default mongoose.model("DiaryEntry", diaryEntrySchema);