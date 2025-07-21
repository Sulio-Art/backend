import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  theme: { type: String, enum: ['light', 'dark'], default: 'light' },
  notificationsEnabled: { type: Boolean, default: true },
  language: { type: String, default: 'en' }
});

export default mongoose.model('Setting', settingSchema);
