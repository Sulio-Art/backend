import asyncHandler from "express-async-handler";
import Event from "../model/eventManagment.Model.js";
import mongoose from "mongoose";

/**
 * @desc    Create a new event
 * @route   POST /api/events
 * @access  Private
 */
const createEvent = asyncHandler(async (req, res) => {
  const { title, startTime, endTime } = req.body;

  if (endTime && new Date(endTime) < new Date(startTime)) {
    res.status(400);
    throw new Error("End time cannot be before the start time.");
  }

  const newEvent = new Event({
    ...req.body,
    userId: req.user.id,
  });

  const savedEvent = await newEvent.save();
  res.status(201).json(savedEvent);
});

/**
 * @desc    Get all events for the logged-in user
 * @route   GET /api/events
 * @access  Private
 */
const getAllEvents = asyncHandler(async (req, res) => {
  const events = await Event.find({ userId: req.user.id })
    .sort({ startTime: -1 })
    .lean();

  const totalEngagement = events.reduce((sum, event) => {
    return sum + (event.participants ? event.participants.length : 0);
  }, 0);

  const totalEvents = events.length;

  res.status(200).json({
    events,
    totalEvents,
    totalEngagement,
    currentPage: 1,
    totalPages: 1,
  });
});

/**
 * @desc    Get a single event by ID
 * @route   GET /api/events/:id
 * @access  Private
 */
const getEventById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error("Invalid Event ID");
  }

  const event = await Event.findOne({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!event) {
    res.status(404);
    throw new Error("Event not found or user not authorized");
  }

  res.status(200).json(event);
});

/**
 * @desc    Update an event
 * @route   PUT /api/events/:id
 * @access  Private
 */
const updateEvent = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error("Invalid Event ID");
  }

  const { startTime, endTime } = req.body;
  if (startTime && endTime && new Date(endTime) < new Date(startTime)) {
    res.status(400);
    throw new Error("End time cannot be before the start time.");
  }

  const updatedEvent = await Event.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    req.body,
    { new: true, runValidators: true }
  );

  if (!updatedEvent) {
    res.status(404);
    throw new Error("Event not found or user not authorized to update");
  }

  res.status(200).json(updatedEvent);
});

/**
 * @desc    Delete an event
 * @route   DELETE /api/events/:id
 * @access  Private
 */
const deleteEvent = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error("Invalid Event ID");
  }

  const event = await Event.findOneAndDelete({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!event) {
    res.status(404);
    throw new Error("Event not found or user not authorized");
  }

  res.status(200).json({ message: "Event deleted successfully" });
});

/**
 * @desc    Join an event
 * @route   POST /api/events/:id/join
 * @access  Private
 */
const joinEvent = asyncHandler(async (req, res) => {
  const eventId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    res.status(400);
    throw new Error("Invalid Event ID");
  }

  const updatedEvent = await Event.findByIdAndUpdate(
    eventId,
    { $addToSet: { participants: req.user.id } },
    { new: true }
  );

  if (!updatedEvent) {
    res.status(404);
    throw new Error("Event not found");
  }

  res.status(200).json(updatedEvent);
});

/**
 * @desc    Leave an event
 * @route   POST /api/events/:id/leave
 * @access  Private
 */
const leaveEvent = asyncHandler(async (req, res) => {
  const eventId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    res.status(400);
    throw new Error("Invalid Event ID");
  }

  const updatedEvent = await Event.findByIdAndUpdate(
    eventId,
    { $pull: { participants: req.user.id } },
    { new: true }
  );

  if (!updatedEvent) {
    res.status(404);
    throw new Error("Event not found");
  }

  res.status(200).json(updatedEvent);
});

export {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  joinEvent,
  leaveEvent,
};
