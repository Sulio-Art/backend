import DiaryEntry from '../model/diaryEntry.Model.js';
import mongoose from 'mongoose';

const createDiaryEntry = async (req, res) => {
  try {
    const { date, mood, content } = req.body;

    if (!content) {
      return res.status(400).json({ message: 'Content is required for a diary entry' });
    }

    const userId = req.user.id;

    const newEntry = new DiaryEntry({
      userId,
      date,
      mood,
      content,
    });

    const savedEntry = await newEntry.save();
    res.status(201).json(savedEntry);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};


const getMyDiaryEntries = async (req, res) => {
  try {
    const entries = await DiaryEntry.find({ userId: req.user.id }).sort({ date: -1 });
    res.status(200).json(entries);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const getDiaryEntryById = async (req, res) => {
  try {
    const entryId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(entryId)) {
        return res.status(400).json({ message: 'Invalid Diary Entry ID' });
    }

    const entry = await DiaryEntry.findById(entryId);

    if (!entry) {
      return res.status(404).json({ message: 'Diary entry not found' });
    }

    if (entry.userId.toString() !== req.user.id) {
      return res.status(404).json({ message: 'Diary entry not found' }); 
    }

    res.status(200).json(entry);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};


const updateDiaryEntry = async (req, res) => {
  try {
    const entryId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(entryId)) {
        return res.status(400).json({ message: 'Invalid Diary Entry ID' });
    }

    const { date, mood, content } = req.body;
    const entry = await DiaryEntry.findById(entryId);

    if (!entry) {
      return res.status(404).json({ message: 'Diary entry not found' });
    }
    
    if (entry.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'User not authorized to update this entry' });
    }

    entry.date = date || entry.date;
    entry.mood = mood || entry.mood;
    entry.content = content || entry.content;

    const updatedEntry = await entry.save();
    res.status(200).json(updatedEntry);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};


const deleteDiaryEntry = async (req, res) => {
  try {
    const entryId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(entryId)) {
        return res.status(400).json({ message: 'Invalid Diary Entry ID' });
    }
    
    const entry = await DiaryEntry.findById(entryId);

    if (!entry) {
      return res.status(404).json({ message: 'Diary entry not found' });
    }
    
    if (entry.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'User not authorized to delete this entry' });
    }

    await DiaryEntry.findByIdAndDelete(entryId);
    res.status(200).json({ message: 'Diary entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export {
  createDiaryEntry,
  getMyDiaryEntries,
  getDiaryEntryById,
  updateDiaryEntry,
  deleteDiaryEntry,
};
