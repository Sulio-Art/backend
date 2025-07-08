import express from 'express';
import { createArtwork, getAllArtworks,getArtworkById,updateArtwork,deleteArtwork } from '../controller/artWork.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/cloudinery.middleware.js';
const router = express.Router();

router.get('/', getAllArtworks);
router.get('/:id', getArtworkById);

router.post('/', protect,upload.single('image'), createArtwork);
router.put('/:id', protect, updateArtwork);
router.delete('/:id', protect, deleteArtwork);

export default router;