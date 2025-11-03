import mongoose from "mongoose";

// Sub-schemas to keep the main profile schema organized.
const countryStatSchema = new mongoose.Schema(
  {
    name: String,
    count: Number,
  },
  { _id: false }
);

const ageGroupSchema = new mongoose.Schema(
  {
    label: String,
    count: Number,
    color: String,
  },
  { _id: false }
);

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

    // --- START: NEW DASHBOARD FIELDS WITH DEFAULTS ---
    messagesSent: {
      type: Number,
      default: 0,
    },
    sentimentScore: {
      type: String,
      default: "0.00",
    },
    artworkSoldToday: {
      type: Number,
      default: 0,
    },
    countryStats: {
      type: [countryStatSchema],
      default: [], // Defaults to an empty array, which the UI handles.
    },
    ageGroups: {
      type: [ageGroupSchema],
      default: [
        // Defaults to the full "zero-state" structure for the donut chart.
        { label: "0-17", count: 0, color: "#3498db" },
        { label: "18-24", count: 0, color: "#2ecc71" },
        { label: "25-34", count: 0, color: "#e74c3c" },
        { label: "35-44", count: 0, color: "#f1c40f" },
        { label: "45-59", count: 0, color: "#9b59b6" },
        { label: "60+", count: 0, color: "#1abc9c" },
      ],
    },
    // --- END: NEW DASHBOARD FIELDS ---
  },
  { timestamps: true }
);

const Profile =
  mongoose.models.Profile || mongoose.model("Profile", profileSchema);

export default Profile;
