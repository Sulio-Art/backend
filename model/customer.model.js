import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    // The Artist's ID (Middleman)
    recipient_id: {
      type: String,
      required: true,
      index: true,
    },
    // The Fan/Customer ID
    sender_id: {
      type: String,
      required: true,
      // CRITICAL FIX: Removed 'unique: true'.
      // One fan can message multiple artists, so sender_id is not unique globally.
    },
    fullname: String,
    username: String,
    age: {
      type: String,
      default: "0-17", // Matches your exact string requirement
    },
    country: {
      type: String,
      default: "unknown",
    },
    status: {
      type: String, // "Normal", "VIP", "VVIP"
      default: "Normal",
    },
    tags: String,
    summary: String,

    // Arrays
    sentiment: {
      type: [Number], // Array of floats
      default: [],
    },
    conversation_history: {
      type: Array, // Stores the chat objects
      default: [],
    },

    last_contacted: String, // Stored as string in your screenshot
  },
  {
    timestamps: true,
    collection: "users_backend1", // Forces reading from this specific collection
    strict: false, // Prevents crashes if python script adds extra fields
  }
);

// Optional: specific index to speed up lookups for a specific pair
customerSchema.index({ recipient_id: 1, sender_id: 1 });

const Customer =
  mongoose.models.Customer ||
  mongoose.model("Customer", customerSchema, "users_backend1");

export default Customer;
