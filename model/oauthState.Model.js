import mongoose from "mongoose";

/**
 * A single-use nonce binding an Instagram OAuth redirect to the browser session
 * that started it.
 *
 * Without this, `state` is only a flow selector ("login" / "connect") and an
 * attacker can replay their own authorization code into a victim's session:
 * the victim's browser links the attacker's Instagram account to the victim's
 * user record, after which the attacker logs in as the victim. See
 * META-COMPLIANCE-PLAN.md 1.1 for the full chain.
 *
 * The nonce is stored one-way hashed, so a leaked copy of this collection
 * cannot be replayed — the same reasoning as `Otp.otp`.
 */
const oauthStateSchema = new mongoose.Schema(
  {
    nonceHash: { type: String, required: true, unique: true },

    intent: {
      type: String,
      enum: ["login", "connect"],
      required: true,
    },

    /**
     * Set only for `connect`: the user who asked for the redirect. The callback
     * has to arrive on that same session, otherwise it is a forged request and
     * is what the takeover chain depends on.
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Mongo removes expired nonces on its own, so unused ones cannot accumulate.
oauthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * No field encryption here deliberately: `nonceHash` is already a one-way hash
 * and `intent`/`userId` have to stay queryable. There is no plaintext secret in
 * this document to protect.
 */
const OAuthState = mongoose.model("OAuthState", oauthStateSchema);

export default OAuthState;
