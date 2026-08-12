import mongoose from 'mongoose';
import { applyFieldEncryption } from "../conifg/encryptedFields.js";

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    transactionDate: { type: Date, default: Date.now },

    status: {
      type: String,
      enum: ["completed", "failed", "pending", "sold"],
      default: "pending",
    },
    paymentMethod: { type: String, default: "paypal" },
    provider: String,
    paypalOrderId: { type: String, unique: true, sparse: true },
    details: mongoose.Schema.Types.Mixed,

    /**
     * Set when the owning account is deleted. The financial record is kept for the
     * 5–7 year retention the privacy policy commits to, but `details` (the raw
     * provider payload, which carries payer name, email and address) is emptied
     * and `userId` no longer resolves. See services/accountDeletion.Service.js.
     */
    anonymizedAt: { type: Date, default: null },
  },    // need razor pay model too
  { timestamps: true }
);

applyFieldEncryption(transactionSchema, "Transaction");

export default mongoose.models.Transaction ||
  mongoose.model("Transaction", transactionSchema);