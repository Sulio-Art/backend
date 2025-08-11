import express from 'express';
import {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  joinEvent,
  leaveEvent,
} from "../controller/event.Controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.route("/").post(protect, createEvent).get(protect, getAllEvents);

router
  .route("/:id")
  .get(protect, getEventById)
  .put(protect, updateEvent)
  .delete(protect, deleteEvent);

router.post("/:id/join", protect, joinEvent);
router.post("/:id/leave", protect, leaveEvent);


export default router;