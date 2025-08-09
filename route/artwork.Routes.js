import express from 'express';
import {
  createArtwork,
  getAllArtworks,
  getArtworkById,
  updateArtwork,
  getArtworksByUser,
  deleteArtwork,
} from "../controller/artWork.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/cloudinery.middleware.js";
const router = express.Router();

router.get("/", getAllArtworks);
router.get("/:id", getArtworkById);
router.get("/user/:userId", getArtworksByUser);

router.route('/')
    .post(protect, upload.single('image'), createArtwork);

router.route('/:id')
    .put(protect, updateArtwork)
    .delete(protect, deleteArtwork);



export default router;