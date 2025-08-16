import Event from "../model/eventManagment.Model.js";
import Transaction from "../model/transaction.Model.js";
import Chat from "../model/chat.Model.js";
import Profile from "../model/profile.Model.js";
import Artwork from "../model/artWork.Model.js";
import mongoose from "mongoose";

/**
 * @desc    Get the onboarding status for the logged-in user
 * @route   GET /api/dashboard/onboarding-status
 * @access  Private
 */
export const getOnboardingStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const artworkCount = await Artwork.countDocuments({ createdBy: userId });
    const hasUploadedArtwork = artworkCount > 0;
    const profile = await Profile.findOne({ userId });
    const isChatbotConfigured = profile ? profile.isChatbotConfigured : false;

    res.status(200).json({
      hasUploadedArtwork,
      isChatbotConfigured,
    });
  } catch (error) {
    console.error("Onboarding Status Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * @desc    Get aggregated stats for the main dashboard
 * @route   GET /api/dashboard/stats
 * @access  Private
 */
export const getDashboardStats = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const totalEvents = await Event.countDocuments({ userId });
    const messagesSent = await Chat.countDocuments({ userId });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const artworkSoldToday = await Transaction.countDocuments({
      userId,
      status: "completed",
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    });

    const recentTransactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5);

    const countryStats = await Transaction.aggregate([
      {
        $match: {
          userId: userId,
          "customerInfo.country": { $exists: true, $ne: null },
        },
      },
      { $group: { _id: "$customerInfo.country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, name: "$_id", count: "$count" } },
    ]);

    const sentimentResult = await Chat.aggregate([
      { $match: { userId: userId, sentiment: { $exists: true } } },
      { $group: { _id: null, avgSentiment: { $avg: "$sentiment" } } },
    ]);

    const sentimentScore =
      sentimentResult.length > 0
        ? parseFloat(sentimentResult[0].avgSentiment.toFixed(3))
        : 0;

    const ageGroups = [];

    res.status(200).json({
      totalEvents,
      messagesSent,
      artworkSoldToday,
      countryStats,
      recentTransactions,
      ageGroups,
      sentimentScore,
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};