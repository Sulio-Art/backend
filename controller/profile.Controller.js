// backend/controller/profile.Controller.js

import cloudinary from "../middleware/cloudinery.middleware.js";
import streamifier from "streamifier";
import Profile from "../model/profile.Model.js";
import mongoose from "mongoose";

// ... your createOrUpdateMyProfile function ...
const createOrUpdateMyProfile = async (req, res) => {
  // ... this function remains the same
};

// --- REPLACE THE ENTIRE getMyProfile FUNCTION WITH THIS ---
const getMyProfile = async (req, res) => {
  try {
    // We get the user ID from the protect middleware
    const userId = req.user.id;

    let profile = await Profile.findOne({ userId: userId }).populate(
      "userId",
      "firstName lastName email"
    );

    // FIX: If no profile exists for the user, create a default one.
    if (!profile) {
      console.log(
        `No profile found for user ${userId}, creating a default one.`
      );

      // Create a new profile instance with default values
      profile = new Profile({
        userId: userId,
        bio: "Welcome to my profile! I'm excited to share my art.",
        // The default profile picture URL will be taken from your Profile model schema.
      });

      // Save the new default profile to the database
      await profile.save();

      // We need to re-populate the user information onto the newly created profile
      // before sending it back to the client.
      await profile.populate("userId", "firstName lastName email");
    }

    // Whether the profile was found or newly created, send it back.
    res.status(200).json(profile);
  } catch (error) {
    console.error("Get My Profile Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
// --- END OF REPLACEMENT ---

// ... the rest of your exported functions (getProfileByUserId, etc.) ...
const getProfileByUserId = async (req, res) => {
  // ... this function remains the same
};

const getAllProfiles = async (req, res) => {
  // ... this function remains the same
};

const deleteMyProfile = async (req, res) => {
  // ... this function remains the same
};

export {
  createOrUpdateMyProfile,
  getMyProfile,
  getProfileByUserId,
  getAllProfiles,
  deleteMyProfile,
};
