import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
<<<<<<< HEAD
    phoneNumber: { type: String, unique: true, sparse: true },
=======
    phoneNumber: { type: String,unique: true, sparse: true },
>>>>>>> a25f19837f3526ea107db938ba4b0d608b67163f
    password: { type: String, required: true, unique: true, sparse: true },
    isVerified: { type: Boolean, default: false },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    otp: String,
    otpExpires: Date,

    instagramUserId: { type: String, default: null },
    instagramAccessToken: { type: String, default: null },
    instagramTokenExpiresAt: { type: Date, default: null },
    instagramUsername: { type: String, default: null },
    instagramProfilePictureUrl: { type: String, default: null },
    instagramFollowersCount: { type: Number, default: 0 },
    instagramBio: { type: String, default: null },
    instagramWebsite: { type: String, default: null },

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

    // --- NEW FIELDS FOR YEARLY PLANS ---
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly", // All users default to monthly
    },
    yearlyQueriesRemaining: {
      type: Number,
      default: 0, // Users on yearly plans will have this value set
    },
    // ------------------------------------

    monthlyQueriesRemaining: {
      type: Number,
      default: 10,
    },
    queryCountResetAt: {
      type: Date,
      default: () => new Date(),
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

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
