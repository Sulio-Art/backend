import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./conifg/database.js";
import cookieParser from "cookie-parser";
import errorHandler from "./middleware/errorHandler.js";
import transactionRoutes from "./route/transaction.Routes.js";
import dashboardRoutes from "./route/dashboard.Routes.js";
import authRoutes from "./route/auth.Routes.js";
import artworkRoutes from "./route/artwork.Routes.js";
import eventRoutes from "./route/event.Routes.js";
import profileRoutes from "./route/profile.Routes.js";
import customerRoutes from "./route/customer.Routes.js";
import chatRoutes from "./route/chat.Routes.js";
import diaryRoutes from "./route/dailylogs.Routes.js";
import adminRoutes from "./route/admin.Routes.js";
import subscriptionRoutes from "./route/subscription.Routes.js";
import verifyOtpRoutes from "./route/verifyOtp.Routes.js";

dotenv.config();
const startServer = async () => {
  const app = express();
  const PORT = process.env.PORT || 5000;

  try {
    await connectDB();

    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((item) => item.trim())
      : [];

    console.log(
      `[SERVER-STARTUP] Allowed origins configured: ${allowedOrigins.join(
        ", "
      )}`
    );

    const corsOptions = {
      origin: (origin, callback) => {
        console.log(
          `[BACKEND-CORS-DEBUG] 1. Incoming request from origin: ${origin}`
        );
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
          console.log(`[BACKEND-CORS-DEBUG] 2. SUCCESS: Origin is allowed.`);
          callback(null, true);
        } else {
          console.error(
            `[BACKEND-CORS-DEBUG] 2. FAILURE: Origin is NOT in the allowed list.`
          );
          callback(new Error(`Origin '${origin}' not allowed by CORS`));
        }
      },
      credentials: true,
    };

    app.use(cors(corsOptions));

    app.use(express.json());
    app.use(cookieParser());

    app.use("/api/auth", authRoutes);
    app.use("/api/auth/verify-otp", verifyOtpRoutes);
    app.use("/api/artworks", artworkRoutes);
    app.use("/api/chat", chatRoutes);
    app.use("/api/customers", customerRoutes);
    app.use("/api/diary", diaryRoutes);
    app.use("/api/events", eventRoutes);
    app.use("/api/profiles", profileRoutes);
    app.use("/api/dashboard", dashboardRoutes);
    app.use("/api/transactions", transactionRoutes);
    app.use("/api/subscriptions", subscriptionRoutes);
    app.use("/api/admin", adminRoutes);

    app.get("/", (req, res) => {
      res.send("Sulio Art API is running...");
    });

    app.use(errorHandler);

    app.listen(PORT, () =>
      console.log(
        `Server running in ${
          process.env.NODE_ENV || "development"
        } mode on port ${PORT}`
      )
    );
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
