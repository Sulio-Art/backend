import Artwork from '../model/artWork.Model.js';
import mongoose from 'mongoose';

import cloudinary from '../middleware/cloudinery.middleware.js';
import streamifier from 'streamifier'; 


// const createArtwork = async (req, res) => {
//   try {
//     const { title, description, imageUrl, category } = req.body;
    
//     const userId = req.user.id; 

//     if (!title || !imageUrl) {
//       return res.status(400).json({ message: 'Title and Image URL are required' });
//     }

//      const result = await cloudinary.uploader.upload_stream(
//       { folder: 'artworks' },
//       async (error, result) => {
//         if (error) {
//           return res.status(500).json({ message: 'Cloudinary Upload Error', error: error.message });
//         }


//     const newArtwork = new Artwork({
//       title,
//       description,
//       imageUrl,
//       category,
//       createdBy: userId, 
//     });

//     const savedArtwork = await newArtwork.save();
//   }
//   )
    
//     await savedArtwork.populate('createdBy', 'name email');

//     res.status(201).json(savedArtwork);
//   } catch (error) {
//     res.status(500).json({ message: 'Server Error', error: error.message });
//   }
// };

const createArtwork = async (req, res) => {
  try {
    const { title, description, category } = req.body;
    const userId = req.user.id;

    if (!title || !req.file) {
      return res.status(400).json({ message: 'Title and image file are required' });
    }

    const cloudinaryUpload = () => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'artworks' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });
    };

    const result = await cloudinaryUpload();

    const newArtwork = new Artwork({
      title,
      description,
      imageUrl: result.secure_url,
      category,
      createdBy: userId,
    });

    const savedArtwork = await newArtwork.save();
    await savedArtwork.populate('createdBy', 'name email');

    res.status(201).json(savedArtwork);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const getAllArtworks = async (req, res) => {
  try {
    const artworks = await Artwork.find({})
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json(artworks);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};


const getArtworkById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'Invalid Artwork ID' });
    }

    const artwork = await Artwork.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!artwork) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    res.status(200).json(artwork);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};


const updateArtwork = async (req, res) => {
  try {
    const { title, description, imageUrl, category } = req.body;
    const artworkId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(artworkId)) {
        return res.status(400).json({ message: 'Invalid Artwork ID' });
    }
    
    const artwork = await Artwork.findById(artworkId);

    if (!artwork) {
      return res.status(404).json({ message: 'Artwork not found' });
    }
    if (artwork.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'User not authorized to update this artwork' });
    }

    artwork.title = title || artwork.title;
    artwork.description = description || artwork.description;
    artwork.imageUrl = imageUrl || artwork.imageUrl;
    artwork.category = category || artwork.category;

    const updatedArtwork = await artwork.save();
    await updatedArtwork.populate('createdBy', 'name email');


    res.status(200).json(updatedArtwork);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};


const deleteArtwork = async (req, res) => {
  try {
    const artworkId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(artworkId)) {
        return res.status(400).json({ message: 'Invalid Artwork ID' });
    }

    const artwork = await Artwork.findById(artworkId);

    if (!artwork) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    if (artwork.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'User not authorized to delete this artwork' });
    }

    await Artwork.findByIdAndDelete(artworkId);

    res.status(200).json({ message: 'Artwork deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};


export {
  createArtwork,
  getAllArtworks,
  getArtworkById,
  updateArtwork,
  deleteArtwork,
};