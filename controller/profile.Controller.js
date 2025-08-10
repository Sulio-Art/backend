import cloudinary from "../middleware/cloudinery.middleware.js";
import streamifier from "streamifier";
import Profile from "../model/profile.Model.js";
import User from "../model/user.model.js";
import mongoose from "mongoose";

const createOrUpdateMyProfile = async (req, res) => {
  const { bio, website, location, instagram, twitter, portfolio, phoneNumber } =
    req.body;
  const profileFields = {
    userId: req.user.id,
    bio,
    website,
    location,
    socialLinks: { instagram, twitter, portfolio },
  };

  try {
    if (req.files) {
      if (req.files.profilePicture) {
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "profile-pictures" },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          streamifier
            .createReadStream(req.files.profilePicture[0].buffer)
            .pipe(uploadStream);
        });
        profileFields.profilePicture = result.secure_url;
      }
      if (req.files.coverPhoto) {
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "cover-photos" },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            }
          );
          streamifier
            .createReadStream(req.files.coverPhoto[0].buffer)
            .pipe(uploadStream);
        });
        profileFields.coverPhoto = result.secure_url;
      }
    }

    if (phoneNumber !== undefined) {
      await User.findByIdAndUpdate(req.user.id, { phoneNumber });
    }

    let profile = await Profile.findOneAndUpdate(
      { userId: req.user.id },
      { $set: profileFields },
      { new: true, upsert: true, setDefaultsOnInsert: true }
      // --- UPDATED: Added 'phoneNumber' to the populate list ---
    ).populate(
      "userId",
      "firstName lastName email instagramUsername phoneNumber"
    );

    res.status(200).json(profile);
  } catch (error) {
    console.error("Create/Update Profile Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    let profile = await Profile.findOne({ userId: userId }).populate(
      "userId",

      "firstName lastName email instagramUsername phoneNumber"
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

      await profile.populate(
        "userId",
        "firstName lastName email instagramUsername phoneNumber"
      );
    }

    res.status(200).json(profile);
  } catch (error) {
    console.error("Get My Profile Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getProfileByUserId = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ message: "Invalid User ID" });
    }

    const profile = await Profile.findOne({
      userId: req.params.userId,
      
    }).populate("userId", "firstName lastName email phoneNumber");

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    res.status(200).json(profile);
  } catch (error) {
    console.error("Get Profile By User ID Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const getAllProfiles = async (req, res) => {
  try {
    const profiles = await Profile.find().populate(
      "userId",

      "firstName lastName email phoneNumber"
    );
    res.status(200).json(profiles);
  } catch (error) {
    console.error("Get All Profiles Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const deleteMyProfile = async (req, res) => {
  try {
    const profile = await Profile.findOneAndDelete({ userId: req.user.id });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found to delete." });
    }

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