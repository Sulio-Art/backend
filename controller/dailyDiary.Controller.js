import DiaryEntry from '../model/diaryEntry.Model.js';
import mongoose from 'mongoose';
import cloudinary from "../middleware/cloudinery.middleware.js";
import asyncHandler from "express-async-handler";

const createDiaryEntry = asyncHandler(async (req, res) => {
  const { date, category, subject, description, studioLife } = req.body;

  if (!date || !category) {
    res.status(400);
    throw new Error("Date and Category are required fields.");
  }

  if (!req.files || req.files.length === 0) {
    res.status(400);
    throw new Error("At least one artwork photo is required.");
  }

  const uploadPromises = req.files.map((file) => {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: "diary_entries" },
        (error, result) => {
          if (error) return reject(error);

          resolve({ url: result.secure_url, public_id: result.public_id });
        }
      );
      uploadStream.end(file.buffer);
    });
  });

  const uploadedFiles = await Promise.all(uploadPromises);

  const newEntry = new DiaryEntry({
    userId: req.user.id,
    date,
    category,
    subject,
    description,
    studioLife,
    artworkPhotos: uploadedFiles,
  });

  const savedEntry = await newEntry.save();
  res.status(201).json(savedEntry);
});

const getMyDiaryEntries = asyncHandler(async (req, res) => {
  const entries = await DiaryEntry.find({ userId: req.user.id }).sort({
    date: -1,
  });
  res.status(200).json(entries);
});

const getDiaryEntryById = asyncHandler(async (req, res) => {
  const entryId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(entryId)) {
    res.status(400);
    throw new Error("Invalid Diary Entry ID");
  }

  const entry = await DiaryEntry.findById(entryId);

  if (!entry || entry.userId.toString() !== req.user.id) {
    res.status(404);
    throw new Error("Diary entry not found");
  }

  res.status(200).json(entry);
});

const updateDiaryEntry = asyncHandler(async (req, res) => {
  const { date, category, subject, description, studioLife } = req.body;
  const entryId = req.params.id;

  const entry = await DiaryEntry.findById(entryId);

  if (!entry || entry.userId.toString() !== req.user.id) {
    res.status(404);
    throw new Error("Diary entry not found");
  }

  if (req.files && req.files.length > 0) {
    if (entry.artworkPhotos && entry.artworkPhotos.length > 0) {
      const publicIds = entry.artworkPhotos.map((photo) => photo.public_id);
      await cloudinary.api.delete_resources(publicIds);
    }

    const uploadPromises = req.files.map((file) => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "diary_entries" },
          (error, result) => {
            if (error) return reject(error);
            resolve({ url: result.secure_url, public_id: result.public_id });
          }
        );
        uploadStream.end(file.buffer);
      });
    });
    const uploadedFiles = await Promise.all(uploadPromises);
    entry.artworkPhotos = uploadedFiles;
  }

  entry.date = date || entry.date;
  entry.category = category || entry.category;
  entry.subject = subject;
  entry.description = description;
  entry.studioLife = studioLife;

  const updatedEntry = await entry.save();
  res.status(200).json(updatedEntry);
});

const deleteDiaryEntry = asyncHandler(async (req, res) => {
  const entryId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(entryId)) {
    res.status(400);
    throw new Error("Invalid Diary Entry ID");
  }

  const entry = await DiaryEntry.findById(entryId);

  if (!entry || entry.userId.toString() !== req.user.id) {
    res.status(404);
    throw new Error("Diary entry not found");
  }

  if (entry.artworkPhotos && entry.artworkPhotos.length > 0) {
    const publicIds = entry.artworkPhotos.map((photo) => photo.public_id);
    await cloudinary.api.delete_resources(publicIds);
  }

  await DiaryEntry.findByIdAndDelete(entryId);

  res
    .status(200)
    .json({ message: "Diary entry deleted successfully", deletedId: entryId });
});

export {
  createDiaryEntry,
  getMyDiaryEntries,
  getDiaryEntryById,
  updateDiaryEntry,
  deleteDiaryEntry,
};