import mongoose from 'mongoose';

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
    subject: {
      type: String,
      maxlength: 100,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    studioLife: {
      type: String,
      maxlength: 500,
    },

    artworkPhotos: {
      type: [artworkPhotoSchema],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model("DiaryEntry", diaryEntrySchema);