import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  transactionDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['completed', 'failed', 'pending'], default: 'pending' },
  paymentMethod: { type: String, default: 'paypal' },
  provider: String,
  paypalOrderId: { type: String, unique: true, sparse: true },
  details: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

export default mongoose.model('Transaction', transactionSchema);