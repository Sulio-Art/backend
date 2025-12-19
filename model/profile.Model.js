import mongoose from "mongoose";

const profileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bio: String,
    profilePicture: {
      type: String,
      default: "https://i.imgur.com/6VBx3io.png",
    },
    coverPhoto: {
      type: String,
      default: "https://i.imgur.com/8V254hN.png",
    },
    isChatbotConfigured: {
      type: Boolean,
      default: false,
    },
    chatbotSettings: {
      type: Map,
      of: String,
      default: () => new Map(),
    },
    website: String,
    location: String,
    socialLinks: {
      instagram: String,
      twitter: String,
      portfolio: String,
    },
    // Sales data stays here
    artworkSoldToday: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Standard Profile collection
const Profile =
  mongoose.models.Profile || mongoose.model("Profile", profileSchema);

export default Profile;
