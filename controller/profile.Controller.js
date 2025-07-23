import cloudinary from "../middleware/cloudinery.middleware.js";
import streamifier from "streamifier";
import Profile from "../model/profile.Model.js";

import mongoose from "mongoose";

/**
 * @desc    Create or update the logged-in user's profile
 * @route   PUT /api/profiles/me
 * @access  Private
 */
const createOrUpdateMyProfile = async (req, res) => {
  const { bio, website, location, instagram, twitter, portfolio } = req.body;
  const profileFields = {
    userId: req.user.id,
    bio,
    website,
    location,
    socialLinks: { instagram, twitter, portfolio },
  };

  try {
    // Handle Profile Picture Upload if a file is present
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "profile-pictures" },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });
      profileFields.profilePicture = result.secure_url;
    }

    // Using findOneAndUpdate with upsert:true will create a new profile if one doesn't exist,
    // or update the existing one if it does.
    let profile = await Profile.findOneAndUpdate(
      { userId: req.user.id },
      { $set: profileFields },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).populate("userId", "firstName lastName email");

    res.status(200).json(profile);
  } catch (error) {
    console.error("Create/Update Profile Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

/**
 * @desc    Get the logged-in user's own profile (creates a default if none exists)
 * @route   GET /api/profiles/me
 * @access  Private
 */
const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    let profile = await Profile.findOne({ userId: userId }).populate(
      "userId",
      "firstName lastName email"
    );

    if (!profile) {
      console.log(
        `No profile found for user ${userId}, creating a default one.`
      );
      profile = new Profile({
        userId: userId,
        bio: "Welcome to my profile! I'm excited to share my art.",
      });
      await profile.save();
      await profile.populate("userId", "firstName lastName email");
    }

    res.status(200).json(profile);
  } catch (error) {
    console.error("Get My Profile Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

/**
 * @desc    Get a user's profile by their user ID
 * @route   GET /api/profiles/user/:userId
 * @access  Public
 */
const getProfileByUserId = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ message: "Invalid User ID" });
    }

    const profile = await Profile.findOne({
      userId: req.params.userId,
    }).populate("userId", "firstName lastName email");

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.status(200).json(profile);
  } catch (error) {
    console.error("Get Profile By User ID Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * @desc    Get all user profiles
 * @route   GET /api/profiles
 * @access  Public
 */
const getAllProfiles = async (req, res) => {
  try {
    const profiles = await Profile.find().populate(
      "userId",
      "firstName lastName email"
    );
    res.status(200).json(profiles);
  } catch (error) {
    console.error("Get All Profiles Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * @desc    Delete the logged-in user's profile
 * @route   DELETE /api/profiles/me
 * @access  Private
 */
const deleteMyProfile = async (req, res) => {
  try {
    // Find and delete the profile
    const profile = await Profile.findOneAndDelete({ userId: req.user.id });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found to delete." });
    }

    // Here you could also add logic to delete the user's account from the User model if desired.
    // For now, we only delete the profile.

    res.status(200).json({ message: "Profile deleted successfully" });
  } catch (error) {
    console.error("Delete Profile Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

export {
  createOrUpdateMyProfile,
  getMyProfile,
  getProfileByUserId,
  getAllProfiles,
  deleteMyProfile,
};
