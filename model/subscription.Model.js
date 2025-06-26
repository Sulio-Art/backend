import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  plan: { type: String, enum: ['basic', 'premium', 'pro'], required: true },
  amount: { type: Number, required: true },
  provider: { type: String, enum: ['razorpay', 'stripe'], default: 'razorpay' },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  status: { type: String, enum: ['active', 'expired', 'cancelled', 'pending'], default: 'pending' }
}, { timestamps: true });

export default mongoose.model('Subscription', subscriptionSchema);