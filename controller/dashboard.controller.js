import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Artwork from "../model/artWork.Model.js";
import Profile from "../model/profile.Model.js";

export const getOnboardingStatus = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const artworkCount = await Artwork.countDocuments({ createdBy: userId });
  const hasUploadedArtwork = artworkCount > 0;
  const profile = await Profile.findOne({ userId });
  const isChatbotConfigured = !!profile?.isChatbotConfigured;

  res.status(200).json({
    hasUploadedArtwork,
    isChatbotConfigured,
  });
});

export const getDashboardStats = asyncHandler(async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user.id);

  const userProfile = await Profile.findOne({ userId });

  if (!userProfile) {
    return res.status(404).json({ message: "User profile not found." });
  }

  const totalEvents = 0;
  const recentTransactions = [];

  res.status(200).json({
    messagesSent: userProfile.messagesSent,
    sentimentScore: userProfile.sentimentScore,
    artworkSoldToday: userProfile.artworkSoldToday,
    countryStats: userProfile.countryStats,
    ageGroups: userProfile.ageGroups,
    totalEvents,
    recentTransactions,
  });
});
