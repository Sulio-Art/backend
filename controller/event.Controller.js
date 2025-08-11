import Event from '../model/eventManagment.Model.js';
import mongoose from 'mongoose';

const createEvent = async (req, res) => {
  try {
    const { title, startTime, endTime } = req.body;
    if (!title || !startTime) {
      return res
        .status(400)
        .json({ message: "Title and start time are required" });
    }

    if (endTime && new Date(endTime) < new Date(startTime)) {
      return res
        .status(400)
        .json({ message: "End time cannot be before the start time." });
    }

    const newEvent = new Event({
      ...req.body,
      userId: req.user.id,
    });
    const savedEvent = await newEvent.save();
    res.status(201).json(savedEvent);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getAllEvents = async (req, res) => {
  try {
    const filter = { userId: req.user.id };

    const events = await Event.find(filter).sort({ startTime: -1 }).lean();

    const totalEngagement = events.reduce((sum, event) => {
      return sum + (event.participants ? event.participants.length : 0);
    }, 0);

    const totalEvents = events.length;

    const totalPages = 1;
    const currentPage = 1;

    res.status(200).json({
      events,
      totalEvents,
      totalEngagement,
      currentPage,
      totalPages,
    });
  } catch (error) {
    console.error("[Backend Error] in getAllEvents:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getEventById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid Event ID" });
    }
    const event = await Event.findById(req.params.id);
    if (!event || event.userId.toString() !== req.user.id) {
      return res
        .status(404)
        .json({ message: "Event not found or user not authorized" });
    }
    res.status(200).json(event);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const updateEvent = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid Event ID" });
    }

    const { startTime, endTime } = req.body;
    if (startTime && endTime && new Date(endTime) < new Date(startTime)) {
      return res
        .status(400)
        .json({ message: "End time cannot be before the start time." });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    if (event.userId.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "User not authorized to update this event" });
    }
    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    res.status(200).json(updatedEvent);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const deleteEvent = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid Event ID" });
    }
    const event = await Event.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!event) {
      return res
        .status(404)
        .json({ message: "Event not found or user not authorized" });
    }
    res.status(200).json({ message: "Event deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const joinEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid Event ID" });
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      { $addToSet: { participants: userId } },
      { new: true }
    );
    if (!updatedEvent) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.status(200).json(updatedEvent);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const leaveEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid Event ID" });
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      { $pull: { participants: userId } },
      { new: true }
    );
    if (!updatedEvent) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.status(200).json(updatedEvent);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  joinEvent,
  leaveEvent,
};