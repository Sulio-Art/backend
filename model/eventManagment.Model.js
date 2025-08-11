import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { 
      type: String, 
      required: [true, 'Event title is required.'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    startTime: { 
      type: Date, 
      required: [true, 'Event start time is required.'],
    },
    endTime: { 
      type: Date,
    },
    eventType: {
      type: String,
      trim: true,
    },
    timezone: {
      type: String,
      trim: true,
    },
    invitationType: {
      type: String,
      enum: ['Offline', 'Online'],
      default: 'Offline',
    },
    location: {
      type: String,
      trim: true,
    },
    externalLink: {
      type: String,
      trim: true,
    },
    participants: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    }],
  },
  { timestamps: true }
);

export default mongoose.model('Event', eventSchema);