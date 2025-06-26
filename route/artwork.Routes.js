import express from 'express';
import { createArtwork, getAllArtworks,getArtworkById,updateArtwork,deleteArtwork } from '../controller/artWork.controller.js';
import { protect } from '../middleware/auth.middleware.js';
const router = express.Router();

// protect middleware ensures only logged-in users can create artwork
router.get('/', getAllArtworks);
router.get('/:id', getArtworkById);

router.post('/', protect, createArtwork);
router.put('/:id', protect, updateArtwork);
router.delete('/:id', protect, deleteArtwork);

export default router;