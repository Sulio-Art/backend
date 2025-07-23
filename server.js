import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./conifg/database.js";
import cookieParser from "cookie-parser";
import errorHandler from "./middleware/errorHandler.js";

import authRoutes from "./route/auth.Routes.js";
import verifyOtpRoutes from "./route/verifyOtp.Routes.js";
import artworkRoutes from "./route/artwork.Routes.js";
import eventRoutes from "./route/event.Routes.js";
import profileRoutes from "./route/profile.Routes.js";
import settingsRoutes from "./route/setting.Routes.js";
import customerRoutes from "./route/customer.Routes.js";
import chatRoutes from "./route/chat.Routes.js";
import dairyRoutes from "./route/dairy.Routes.js"; // Corrected import name

const startServer = async () => {
  dotenv.config();
  const app = express();
  const PORT = process.env.PORT || 5000;

  try {
    // 1. Connect to Database FIRST
    await connectDB();

    // 2. Mount Middleware only after successful DB connection
    const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
    const corsOptions = {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
          return callback(null, true);
        } else {
          return callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
    };
    app.use(cors(corsOptions));
    app.use(cookieParser());
    app.use(express.json());

    // 3. Mount API Routes
    app.use("/api/auth", authRoutes);
    app.use("/api/auth/verify-otp", verifyOtpRoutes);
    app.use("/api/artworks", artworkRoutes);
    app.use("/api/chat", chatRoutes);
    app.use("/api/customers", customerRoutes);
    app.use("/api/dairy", dairyRoutes); // Corrected route path
    app.use("/api/events", eventRoutes);
    app.use("/api/profiles", profileRoutes);
    app.use("/api/settings", settingsRoutes);

    app.get("/", (req, res) => {
      res.send("Sulio Art API is running...");
    });

    // 4. Mount Global Error Handler
    app.use(errorHandler);

    // 5. Start Listening for Requests
    app.listen(PORT, () =>
      console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
    );

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
