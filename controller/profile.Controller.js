import Profile from '../model/profile.Model.js';
import mongoose from 'mongoose';

const createOrUpdateMyProfile = async (req, res) => {
  try {
    const profileData = { ...req.body, userId: req.user.id };
    
    const profile = await Profile.findOneAndUpdate(
      { userId: req.user.id },
      { $set: profileData },
      { new: true, upsert: true, runValidators: true }
    ).populate('userId', 'name email');

    res.status(200).json(profile);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const getMyProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ userId: req.user.id }).populate('userId', 'name email');
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found for this user' });
    }
    res.status(200).json(profile);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const getProfileByUserId = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ message: 'Invalid User ID' });
    }
    const profile = await Profile.findOne({ userId: req.params.userId }).populate('userId', 'name');
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    res.status(200).json(profile);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const getAllProfiles = async (req, res) => {
  try {
    const profiles = await Profile.find().populate('userId', 'name email');
    res.status(200).json(profiles);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const deleteMyProfile = async (req, res) => {
  try {
    const profile = await Profile.findOneAndDelete({ userId: req.user.id });
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found to delete' });
    }
    res.status(200).json({ message: 'Profile deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export {
  createOrUpdateMyProfile,
  getMyProfile,
  getProfileByUserId,
  getAllProfiles,
  deleteMyProfile
};