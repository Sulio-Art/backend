import mongoose from "mongoose";
import { applyFieldEncryption } from "../conifg/encryptedFields.js";

/**
 * Server-side holding area for an Instagram login that matched no existing user
 * and therefore needs the registration form completed.
 *
 * This replaces the old `completionToken` JWT, whose payload carried the user's
 * long-lived Instagram access token in readable base64 out to the browser — a
 * Platform Terms violation, and forgeable while JWT_SECRET is weak. The browser
 * now holds only an opaque, single-use, 15-minute id; the token never leaves the
 * server. See META-COMPLIANCE-PLAN.md 1.2.
 *
 * `emailVerifiedFor` is the proof-of-verification slot: the account is created
 * with the address recorded here, never with the one in the request body, which
 * is what stops an attacker registering a verified account against somebody
 * else's email (1.3).
 */
const pendingInstagramRegistrationSchema = new mongoose.Schema(
  {
    // hashValue(handoffId, "PendingInstagramRegistration.handoff") — the raw id
    // is returned to the browser once and never stored.
    handoffHash: { type: String, required: true, unique: true },

    instagramUserId: { type: String, required: true },
    instagramUsername: { type: String, default: null },
    instagramAccessToken: { type: String, default: null },
    igid: { type: String, default: null },
    asid: { type: String, default: null },

    // The raw Graph profile response, kept so registration does not have to
    // re-query Instagram. Encrypted as a blob.
    profileSnapshot: { type: Object, default: {} },

    // Written only by verifyInstagramEmailOtp, after a real OTP match.
    emailVerifiedFor: { type: String, default: null },

    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

pendingInstagramRegistrationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);

/**
 * Nothing here is looked up by anything except `handoffHash`, so none of the
 * encrypted fields need a blind index — they are read back after the document is
 * found and compared in memory.
 */
applyFieldEncryption(
  pendingInstagramRegistrationSchema,
  "PendingInstagramRegistration",
);

const PendingInstagramRegistration = mongoose.model(
  "PendingInstagramRegistration",
  pendingInstagramRegistrationSchema,
);

export default PendingInstagramRegistration;
