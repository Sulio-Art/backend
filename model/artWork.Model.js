import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const artworkSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    imageUrls: [{ type: String, required: true }],
    createdBy: { type: Types.ObjectId, ref: "User", required: true },
    size: { type: Number, required: true },
    artworkType: {
      type: String,
      enum: ["for_sale", "not_for_sale"],
      required: true,
    },
    price: {
      type: Number,
      required: function () {
        return this.artworkType === "for_sale";
      },
    },
    creationYear: { type: Number, required: true },
    tag: { type: String, required: true },
    creativeInsights: { type: String },
    technicalIssues: { type: String },

    status: {
      type: String,
      enum: ["Available", "Sold"],
      default: "Available",
    },
  },
  {
    timestamps: true,
  }
);

export default model("Artwork", artworkSchema);