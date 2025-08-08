import express from "express";
import {
  createDiaryEntry,
  getMyDiaryEntries,
  getDiaryEntryById,
  updateDiaryEntry,
  deleteDiaryEntry,
} from "../controller/dailyDiary.Controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/cloudinery.middleware.js";

const router = express.Router();

router.use(protect);

router
  .route("/")
  .get(getMyDiaryEntries)

  .post(upload.array("artworkPhotos", 10), createDiaryEntry);

router
  .route("/:id")
  .get(getDiaryEntryById)

  .put(upload.array("artworkPhotos", 10), updateDiaryEntry)
  .delete(deleteDiaryEntry);

export default router;
