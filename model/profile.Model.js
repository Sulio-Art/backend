import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bio: String,
  avatar: String,
   profilePicture: {
    type: String,
    default: 'https://i.imgur.com/6VBx3io.png', // A default avatar
  },
   website: String,
  location: String,
  socialLinks: {
    instagram: String,
    twitter: String,
    portfolio: String
  }
},{ timestamps: true });

export default mongoose.model('Profile', profileSchema);
