// backend/server.js

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./conifg/database.js"; // Use your good DB connection file
import cookieParser from "cookie-parser";
import errorHandler from "./middleware/errorHandler.js";

// Import all your route files
import authRoutes from "./route/auth.Routes.js";
import artworkRoutes from "./route/artwork.Routes.js";
import eventRoutes from "./route/event.Routes.js";
import profileRoutes from "./route/profile.Routes.js";
import verifyOtpRoutes from "./route/verifyOtp.Routes.js"; 
import settingsRoutes from "./route/setting.Routes.js";
import customerRoutes from "./route/customer.Routes.js";
import chatRoutes from "./route/chat.Routes.js";
import diaryEntryRoutes from "./route/dailylogs.Routes.js";
// ... add any other route imports here
// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// --- START OF CRITICAL MIDDLEWARE CONFIGURATION ---

// Define allowed origins for CORS
const allowedOrigins = ["http://localhost:3000"]; // Add your production frontend URL here later

// Set up robust CORS options
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);

    // Allow the request if the origin is in our allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // This is essential for sending and receiving cookies
};

// Use the configured CORS middleware
app.use(cors(corsOptions));

// Use cookie-parser to help Express parse cookies from incoming requests
app.use(cookieParser());

// Standard middleware to parse JSON request bodies
app.use(express.json());

// --- END OF CRITICAL MIDDLEWARE CONFIGURATION ---

// --- API Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/artworks", artworkRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/verify-otp", verifyOtpRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/diary", diaryEntryRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/settings", settingsRoutes);



app.get("/", (req, res) => {
  res.send("Sulio Art API is running...");
});

app.use(errorHandler);

// --- Server Initialization ---
const PORT = process.env.PORT || 5000;

app.listen(PORT, () =>
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
);
