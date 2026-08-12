import mongoose from "mongoose";
import { applyFieldEncryption } from "../conifg/encryptedFields.js";

/**
 * Audit trail for every account/data deletion, whichever door it came through:
 * Meta's Data Deletion Request callback, Meta's Deauthorize callback, or a user
 * deleting their own account.
 *
 * Meta requires that a data deletion request can be confirmed after the fact via
 * a status URL plus a confirmation code, which is what this collection backs.
 * See META-COMPLIANCE-PLAN.md 1.4.
 */
const deletionRequestSchema = new mongoose.Schema(
  {
    /**
     * Deliberately NOT encrypted: this is a random opaque token, not personal
     * data, and the public status page has to look documents up by it. Same
     * reasoning as the blind-index fields — a value used as a lookup key cannot
     * be randomly encrypted. It carries no information about the account.
     */
    confirmationCode: { type: String, required: true, unique: true },

    source: {
      type: String,
      enum: ["meta-data-deletion", "meta-deauthorize", "self-serve"],
      required: true,
    },

    // Whichever identifiers we had at request time. Meta's callbacks arrive with
    // an app-scoped id (`asid`) and nothing else, so all three are optional.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    asid: { type: String, default: null },
    instagramUserId: { type: String, default: null },
    email: { type: String, default: null },

    status: {
      type: String,
      enum: ["pending", "completed", "partial", "failed"],
      default: "pending",
    },

    // Per-collection counts, so "we deleted it" is auditable rather than assumed.
    deleted: { type: Object, default: {} },

    /**
     * Anything that could not be deleted from Node — today that is the
     * `Customer` / `users_backend1` collection, which an external Python service
     * owns. Recorded rather than silently skipped: reporting a deletion complete
     * while rows survive is worse than an open item.
     */
    outstanding: { type: [String], default: [] },

    error: { type: String, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

applyFieldEncryption(deletionRequestSchema, "DeletionRequest");

const DeletionRequest = mongoose.model("DeletionRequest", deletionRequestSchema);

export default DeletionRequest;
