import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phoneNumber: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    otp: String,
    otpExpires: Date,
    instagramUserId: {
      type: String,
      default: null,
    },
    instagramAccessToken: {
      type: String,
      default: null,
    },
    instagramTokenExpiresAt: {
      type: Date,
      default: null,
    },
    instagramUsername: {
      type: String,
      default: null,
    },
    instagramProfilePictureUrl: {
      type: String,
      default: null,
    },
    instagramFollowersCount: {
      type: Number,
      default: 0,
    },
    instagramBio: {
      type: String,
      default: null,
    },
    instagramWebsite: {
      type: String,
      default: null,
    },
    subscriptionStatus: {
      type: String,
      enum: ["free_trial", "active", "inactive", "cancelled","trial_expired"],
      default: "free_trial",
    },
     currentPlan: {
      type: String,
      enum: ['basic', 'premium', 'pro'],
      default: 'basic',
    },

    
    trialEndsAt: {
      type: Date,
    },
   subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

export default mongoose.models.User || mongoose.model('User', userSchema);