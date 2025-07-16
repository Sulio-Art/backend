import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
const artworkSchema = new Schema({
  title: { type: String, required: true },
  description: String,
  imageUrl: { type: String, required: true },
  category: String,
  createdBy: { type: Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

export default model("Artwork", artworkSchema);
