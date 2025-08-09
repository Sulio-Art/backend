import Artwork from '../model/artWork.Model.js';
import mongoose from "mongoose";
import cloudinary from "../middleware/cloudinery.middleware.js";
import streamifier from "streamifier";

const PLAN_STORAGE_LIMITS = {
  free: 20 * 1024 * 1024,
  basic: 20 * 1024 * 1024,
  trial_expired: 20 * 1024 * 1024,
  plus: 50 * 1024 * 1024,
  premium: 200 * 1024 * 1024,
  pro: 500 * 1024 * 1024,
  default: 20 * 1024 * 1024,
};

const createArtwork = async (req, res) => {
  try {
    const { title, description, category } = req.body;
    const userId = req.user.id;
    const userPlan = req.user.currentPlan || "free";

    if (!title || !req.file) {
      return res
        .status(400)
        .json({ message: "Title and image file are required" });
    }

    const storageLimit =
      PLAN_STORAGE_LIMITS[userPlan] || PLAN_STORAGE_LIMITS.default;
    const newFileSize = req.file.size;

    const usageAggregation = await Artwork.aggregate([
      { $match: { createdBy: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, totalSize: { $sum: "$size" } } },
    ]);
    const currentUsage =
      usageAggregation.length > 0 ? usageAggregation[0].totalSize : 0;

    if (currentUsage + newFileSize > storageLimit) {
      return res.status(403).json({
        message: `Upload failed. You have exceeded your storage limit of ${
          storageLimit / 1024 / 1024
        }MB.`,
      });
    }

    const cloudinaryUpload = () => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "artworks" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });
    };

    const result = await cloudinaryUpload();

    const newArtwork = new Artwork({
      title,
      description,
      imageUrl: result.secure_url,
      category,
      createdBy: userId,
      size: newFileSize,
    });

    const savedArtwork = await newArtwork.save();
    await savedArtwork.populate("createdBy", "name email");

    res.status(201).json(savedArtwork);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getAllArtworks = async (req, res) => {
  try {
    const artworks = await Artwork.find({})
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json(artworks);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getArtworkById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid Artwork ID" });
    }

    const artwork = await Artwork.findById(req.params.id).populate(
      "createdBy",
      "name email"
    );

    if (!artwork) {
      return res.status(404).json({ message: "Artwork not found" });
    }

    res.status(200).json(artwork);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getArtworksByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid User ID" });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const total = await Artwork.countDocuments({ createdBy: userId });
    const totalPages = Math.ceil(total / limit);

    const artworks = await Artwork.find({ createdBy: userId })
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({ artworks, currentPage: page, totalPages });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getStorageStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const userPlan = req.user.currentPlan || "free";
    const storageLimit =
      PLAN_STORAGE_LIMITS[userPlan] || PLAN_STORAGE_LIMITS.default;

    const usageAggregation = await Artwork.aggregate([
      { $match: { createdBy: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, totalSize: { $sum: "$size" } } },
    ]);
    const currentUsage =
      usageAggregation.length > 0 ? usageAggregation[0].totalSize : 0;

    res.status(200).json({ currentUsage, storageLimit });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const updateArtwork = async (req, res) => {
  try {
    const { title, description, imageUrl, category } = req.body;
    const artworkId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(artworkId)) {
      return res.status(400).json({ message: "Invalid Artwork ID" });
    }

    const artwork = await Artwork.findById(artworkId);

    if (!artwork) {
      return res.status(404).json({ message: "Artwork not found" });
    }
    if (artwork.createdBy.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "User not authorized to update this artwork" });
    }

    artwork.title = title || artwork.title;
    artwork.description = description || artwork.description;
    artwork.imageUrl = imageUrl || artwork.imageUrl;
    artwork.category = category || artwork.category;

    const updatedArtwork = await artwork.save();
    await updatedArtwork.populate("createdBy", "name email");

    res.status(200).json(updatedArtwork);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const deleteArtwork = async (req, res) => {
  try {
    const artworkId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(artworkId)) {
      return res.status(400).json({ message: "Invalid Artwork ID" });
    }

    const artwork = await Artwork.findById(artworkId);

    if (!artwork) {
      return res.status(404).json({ message: "Artwork not found" });
    }

    if (artwork.createdBy.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "User not authorized to delete this artwork" });
    }

    await Artwork.findByIdAndDelete(artworkId);

    res.status(200).json({ message: "Artwork deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export {
  createArtwork,
  getAllArtworks,
  getArtworkById,
  updateArtwork,
  deleteArtwork,
  getArtworksByUser,
  getStorageStats,
};