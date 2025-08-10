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
    const userId = req.user.id;
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

    
    const customerLocations = await Transaction.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    ]);

   
    const countryStats = [
      { name: "United States", count: 154 },
      { name: "United Kingdom", count: 87 },
      { name: "Canada", count: 56 },
      { name: "Australia", count: 34 },
      { name: "Germany", count: 23 },
    ];

    const recentTransactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      totalEvents,
      messagesSent,
      artworkSoldToday,
      countryStats,
      recentTransactions,
      ageGroups: [
        { label: "18-24", count: 560, color: "#EF4444" },
        { label: "25-40", count: 654, color: "#8B5CF6" },
        { label: "40-60", count: 245, color: "#10B981" },
        { label: "61-80+", count: 16, color: "#3B82F6" },
      ],
      sentimentScore: 0.897,
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};
