import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { applyFieldEncryption } from "../conifg/encryptedFields.js";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    // Encrypted at rest. The uniqueness constraint lives on emailIndex below,
    // because randomized ciphertext never collides and so cannot enforce it.
    email: { type: String, required: true },

    phoneNumber: { type: String },

    password: { type: String, required: true }, // Fixed: Removed unique:true
    isVerified: { type: Boolean, default: false },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    otp: String,
    otpExpires: Date,

    // --- Instagram Fields ---
    instagramUserId: { type: String, default: null }, // This is the Global IG User ID
    instagramAccessToken: { type: String, default: null },
    instagramTokenExpiresAt: { type: Date, default: null },
    instagramUsername: { type: String, default: null },
    instagramProfilePictureUrl: { type: String, default: null },
    instagramFollowersCount: { type: Number, default: 0 },
    instagramBio: { type: String, default: null },
    instagramWebsite: { type: String, default: null },

    igid: { type: String, default: null },
    asid: { type: String, default: null },

    subscriptionStatus: {
      type: String,
      enum: ["free_trial", "active", "inactive", "cancelled", "trial_expired"],
      default: "free_trial",
    },
    currentPlan: {
      type: String,
      enum: ["free", "plus", "premium", "pro"],
      default: "free",
    },
    trialEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },

    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
    },
    yearlyQueriesRemaining: {
      type: Number,
      default: 0,
    },

    monthlyQueriesRemaining: {
      type: Number,
      default: 10,
    },
    queryCountResetAt: {
      type: Date,
      default: () => new Date(),
    },

    // --- Blind indexes -------------------------------------------------------
    // Deterministic HMACs of the encrypted fields above, maintained by the
    // encryption plugin. They exist so equality lookups still work, and they
    // carry the uniqueness constraints the plaintext fields used to hold.
    // Sparse, because rows not yet migrated have no index value and would
    // otherwise all collide on null.
    emailIndex: {
      type: String,
      unique: true,
      sparse: true,
      select: false,
    },
    phoneNumberIndex: {
      type: String,
      unique: true,
      sparse: true,
      select: false,
    },
    instagramUserIdIndex: {
      type: String,
      index: true,
      sparse: true,
      select: false,
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

// Registered after the password hook so bcrypt still sees the plaintext it
// expects; the two operate on different fields either way.
applyFieldEncryption(userSchema, "User");

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
