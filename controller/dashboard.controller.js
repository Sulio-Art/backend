import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Artwork from "../model/artWork.Model.js";
import Profile from "../model/profile.Model.js";
// Note: We no longer need Chat, TestChat, or Transaction models here.

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

  // Step 1: Perform one fast query to get the user's profile.
  const userProfile = await Profile.findOne({ userId });

  // Safeguard: If for any reason the profile doesn't exist, send a 404.
  // This should not happen if the user is logged in.
  if (!userProfile) {
    return res.status(404).json({ message: "User profile not found." });
  }

  // Step 2: Define placeholder data for items you will connect later.
  const totalEvents = 0;
  const recentTransactions = [];

  // Step 3: Assemble and send the final response.
  // All the primary data is now read directly from the userProfile object.
  res.status(200).json({
    messagesSent: userProfile.messagesSent,
    sentimentScore: userProfile.sentimentScore,
    artworkSoldToday: userProfile.artworkSoldToday,
    countryStats: userProfile.countryStats,
    ageGroups: userProfile.ageGroups,
    // Include the placeholder data
    totalEvents,
    recentTransactions,
  });
});
