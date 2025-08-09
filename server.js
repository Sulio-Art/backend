import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./conifg/database.js";
import cookieParser from "cookie-parser";
import errorHandler from "./middleware/errorHandler.js";
import transactionRoutes from "./route/transaction.Routes.js";
import authRoutes from "./route/auth.Routes.js";
import artworkRoutes from "./route/artwork.Routes.js";
import eventRoutes from "./route/event.Routes.js";
import profileRoutes from "./route/profile.Routes.js";
import settingsRoutes from "./route/setting.Routes.js";
import customerRoutes from "./route/customer.Routes.js";
import chatRoutes from "./route/chat.Routes.js";
import diaryRoutes from "./route/dailylogs.Routes.js";

dotenv.config();
const startServer = async () => {
  const app = express();
  const PORT = process.env.PORT || 5000;

  try {
    await connectDB();

    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : [];

    const corsOptions = {
      origin: (origin, callback) => {
        console.log(`[CORS] Request from origin: ${origin}`);
        console.log(`[CORS] Allowed origins: ${allowedOrigins}`);

        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          console.error(`[CORS] Blocked origin: ${origin}`);
          callback(new Error(`Origin '${origin}' not allowed by CORS`));
        }
      },
      credentials: true,

      allowedHeaders: ["Content-Type", "Authorization"],
    };

    app.use(cors(corsOptions));

    app.use(express.json());
    app.use(cookieParser());

    app.use("/api/auth", authRoutes);
    app.use("/api/artworks", artworkRoutes);
    app.use("/api/chat", chatRoutes);
    app.use("/api/customers", customerRoutes);
    app.use("/api/diary", diaryRoutes);
    app.use("/api/events", eventRoutes);
    app.use("/api/profiles", profileRoutes);
    app.use("/api/settings", settingsRoutes);
    app.use("/api/transactions", transactionRoutes);

    app.get("/", (req, res) => {
      res.send("Sulio Art API is running...");
    });

    app.use(errorHandler);

    app.listen(PORT, () =>
      console.log(
        `Server running in ${process.env.NODE_ENV} mode on port ${PORT}`
      )
    );
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
