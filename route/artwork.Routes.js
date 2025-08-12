import express from 'express';
import {
  createArtwork,
  getArtworkById,
  updateArtwork,
  getArtworksByUser,
  deleteArtwork,
  getStorageStats,
} from "../controller/artWork.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/cloudinery.middleware.js";

const router = express.Router();

router.get("/user", protect, getArtworksByUser);

router.get("/stats/storage", protect, getStorageStats);

router.get("/:id", protect, getArtworkById);

router
  .route("/")
  .post(protect, upload.array("artworkImages", 10), createArtwork);

router
  .route("/:id")
  .put(protect, upload.array("artworkImages", 10), updateArtwork)
  .delete(protect, deleteArtwork);

export default router;