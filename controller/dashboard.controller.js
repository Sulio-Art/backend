import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Artwork from "../model/artWork.Model.js";
import Profile from "../model/profile.Model.js";
import Customer from "../model/customer.model.js";
import User from "../model/user.model.js"; // Import User model

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
  const userId = req.user.id; // This is the MongoDB _id

  // 1. Fetch the User to get their Instagram ID
  const user = await User.findById(userId).select("instagramUserId");

  // 2. Safety Check: If user has no Instagram connected, return empty stats
  if (!user || !user.instagramUserId) {
    return res.status(200).json({
      messagesSent: 0,
      sentimentScore: "0.00",
      artworkSoldToday: 0,
      countryStats: [],
      ageGroups: [],
      totalEvents: 0,
      recentTransactions: [],
    });
  }

  // This is the ID we use to find customers in users_backend1
  const artistInstagramId = user.instagramUserId;

  // 3. Calculate Age Groups
  const ageAggregation = await Customer.aggregate([
    { $match: { recipient_id: artistInstagramId } },
    {
      $group: {
        _id: "$age",
        count: { $sum: 1 },
      },
    },
  ]);

  // 4. Calculate Country Stats
  const countryAggregation = await Customer.aggregate([
    { $match: { recipient_id: artistInstagramId } },
    {
      $group: {
        _id: "$country",
        count: { $sum: 1 },
      },
    },
  ]);

  // 5. Calculate Total Messages
  const messageStats = await Customer.aggregate([
    { $match: { recipient_id: artistInstagramId } },
    {
      $project: {
        interactionCount: { $size: { $ifNull: ["$conversation_history", []] } },
      },
    },
    {
      $group: {
        _id: null,
        totalMessages: { $sum: "$interactionCount" },
      },
    },
  ]);

  // 6. Calculate Average Sentiment
  const sentimentStats = await Customer.aggregate([
    { $match: { recipient_id: artistInstagramId } },
    { $match: { sentiment: { $exists: true, $not: { $size: 0 } } } },
    {
      $project: {
        userAverage: { $avg: "$sentiment" },
      },
    },
    {
      $group: {
        _id: null,
        globalAverage: { $avg: "$userAverage" },
      },
    },
  ]);

  // Extract Data
  const totalMessagesSent = messageStats[0]?.totalMessages || 0;
  const rawSentiment = sentimentStats[0]?.globalAverage || 0;
  const sentimentScore = Number(rawSentiment).toFixed(2);

  // Formatting
  const ageColors = {
    "0-17": "#3498db",
    "18-24": "#2ecc71",
    "25-34": "#e74c3c",
    "35-44": "#f1c40f",
    "45-59": "#9b59b6",
    "60+": "#1abc9c",
  };

  const ageGroups = ageAggregation.map((item) => ({
    label: item._id || "Unknown",
    count: item.count,
    color: ageColors[item._id] || "#cccccc",
  }));

  const countryStats = countryAggregation.map((item) => ({
    label: item._id || "Unknown",
    count: item.count,
  }));

  // Fetch sales from Profile (Using Mongo ID)
  const userProfile = await Profile.findOne({ userId });

  res.status(200).json({
    messagesSent: totalMessagesSent,
    sentimentScore: sentimentScore,
    countryStats: countryStats,
    ageGroups: ageGroups,
    artworkSoldToday: userProfile?.artworkSoldToday || 0,
    totalEvents: 0,
    recentTransactions: [],
  });
});
