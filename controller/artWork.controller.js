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
    const {
      title,
      description,
      artworkType,
      price,
      creationYear,
      tag,
      creativeInsights,
      technicalIssues,
    } = req.body;

    const userId = req.user.id;
    const userPlan = req.user.currentPlan || "free";

    if (!title || !req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ message: "Title and at least one image file are required" });
    }

    const storageLimit =
      PLAN_STORAGE_LIMITS[userPlan] || PLAN_STORAGE_LIMITS.default;
    const totalNewFileSize = req.files.reduce(
      (sum, file) => sum + file.size,
      0
    );

    const usageAggregation = await Artwork.aggregate([
      { $match: { createdBy: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, totalSize: { $sum: "$size" } } },
    ]);
    const currentUsage =
      usageAggregation.length > 0 ? usageAggregation[0].totalSize : 0;

    if (currentUsage + totalNewFileSize > storageLimit) {
      return res.status(403).json({
        message: `Upload failed. You have exceeded your storage limit.`,
      });
    }

    const cloudinaryUpload = (fileBuffer) => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "artworks" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(fileBuffer).pipe(uploadStream);
      });
    };

    const uploadPromises = req.files.map((file) =>
      cloudinaryUpload(file.buffer)
    );
    const uploadResults = await Promise.all(uploadPromises);
    const imageUrls = uploadResults.map((result) => result.secure_url);

    const newArtwork = new Artwork({
      title,
      description,
      artworkType,
      price: parseFloat(price),
      creationYear: parseInt(creationYear, 10),
      tag,
      creativeInsights,
      technicalIssues,
      imageUrls,
      createdBy: userId,
      size: totalNewFileSize,
    });

    const savedArtwork = await newArtwork.save();
    await savedArtwork.populate("createdBy", "name email");

    res.status(201).json(savedArtwork);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getArtworksByUser = async (req, res) => {
  try {
    const userId = req.user.id;

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const filter = { createdBy: new mongoose.Types.ObjectId(userId) };

    if (req.query.search) {
      filter.title = { $regex: req.query.search, $options: "i" };
    }
    if (req.query.status && req.query.status !== "all") {
      filter.status = req.query.status;
    }
    if (req.query.artworkType && req.query.artworkType !== "all") {
      filter.artworkType = req.query.artworkType;
    }
    if (req.query.tag && req.query.tag !== "all") {
      filter.tag = req.query.tag;
    }

    const sort = {};
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    sort[sortBy] = sortOrder;

    const total = await Artwork.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    const artworks = await Artwork.find(filter)
      .populate("createdBy", "name email")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    res.status(200).json({ artworks, currentPage: page, totalPages });
  } catch (error) {
    console.error("Error fetching artworks:", error);
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
    const artworkId = req.params.id;
    const {
      title,
      description,
      artworkType,
      price,
      creationYear,
      tag,
      creativeInsights,
      technicalIssues,
    } = req.body;

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

    const updates = {
      title,
      description,
      artworkType,
      price: parseFloat(price),
      creationYear: parseInt(creationYear, 10),
      tag,
      creativeInsights,
      technicalIssues,
    };

    if (req.files && req.files.length > 0) {
      if (artwork.imageUrls && artwork.imageUrls.length > 0) {
        const publicIds = artwork.imageUrls.map((url) => {
          const parts = url.split("/");
          const publicIdWithExtension = parts.slice(-2).join("/");
          return publicIdWithExtension.substring(
            0,
            publicIdWithExtension.lastIndexOf(".")
          );
        });
        await cloudinary.api.delete_resources(publicIds);
      }

      const cloudinaryUpload = (fileBuffer) => {
        return new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "artworks" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          streamifier.createReadStream(fileBuffer).pipe(uploadStream);
        });
      };
      const uploadPromises = req.files.map((file) =>
        cloudinaryUpload(file.buffer)
      );
      const uploadResults = await Promise.all(uploadPromises);

      updates.imageUrls = uploadResults.map((result) => result.secure_url);
      updates.size = req.files.reduce((sum, file) => sum + file.size, 0);
    }

    const updatedArtwork = await Artwork.findByIdAndUpdate(
      artworkId,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate("createdBy", "name email");

    res.status(200).json(updatedArtwork);
  } catch (error) {
    console.error("Update error:", error);
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

    if (artwork.imageUrls && artwork.imageUrls.length > 0) {
      const publicIds = artwork.imageUrls.map((url) => {
        const parts = url.split("/");
        const publicIdWithExtension = parts.slice(-2).join("/");
        return publicIdWithExtension.substring(
          0,
          publicIdWithExtension.lastIndexOf(".")
        );
      });
      await cloudinary.api.delete_resources(publicIds);
    }

    await Artwork.findByIdAndDelete(artworkId);

    res.status(200).json({ message: "Artwork deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export {
  createArtwork,
  getArtworksByUser,
  getArtworkById,
  updateArtwork,
  deleteArtwork,
  getStorageStats,
};