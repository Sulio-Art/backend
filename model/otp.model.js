import mongoose from "mongoose";
import { applyFieldEncryption } from "../conifg/encryptedFields.js";

const otpSchema = new mongoose.Schema({
  // Encrypted at rest; looked up through emailIndex below.
  email: {
    type: String,
    required: true,
  },
  // Stored as a one-way HMAC. Compare with hashMatches(), never with ===.
  otp: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: "10m",
  },
  emailIndex: {
    type: String,
    index: true,
    sparse: true,
  },
});

applyFieldEncryption(otpSchema, "Otp");

export default mongoose.model("Otp", otpSchema);
