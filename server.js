import "dotenv/config";
import * as Sentry from "@sentry/node";
import express from "express";
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
import metaRoutes from "./route/meta.Routes.js";
import { assertEncryptionConfigured } from "./utils/encryption.js";

/**
 * Field encryption is pointless if the plaintext leaves by way of an error
 * report. Sentry captures request bodies, headers and query strings, which is
 * exactly where credentials and personal data live.
 */
const SENSITIVE_KEY = /pass|secret|token|otp|auth|cookie|key|email|phone/i;

const scrub = (value, depth = 0) => {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));

  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key)
      ? "[redacted]"
      : scrub(entry, depth + 1);
  }
  return output;
};

const scrubEvent = (event) => {
  if (event.request) {
    delete event.request.cookies;
    if (event.request.data) event.request.data = scrub(event.request.data);
    if (event.request.headers) event.request.headers = scrub(event.request.headers);
    if (event.request.query_string) event.request.query_string = "[redacted]";
  }
  if (event.user) {
    // Keep the id for correlation; drop everything that identifies a person.
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }
  if (event.extra) event.extra = scrub(event.extra);
  return event;
};

const startServer = async () => {
  const app = express();
  const PORT = process.env.PORT || 8080;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV || "development",
    integrations: [Sentry.expressIntegration({ app })],
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });

  try {
    // Fail at boot rather than at the first write, when a missing key would
    // mean either storing cleartext or throwing mid-request.
    assertEncryptionConfigured();

    await connectDB();

    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((item) => item.trim())
      : [];

    console.log(
      `[SERVER-STARTUP] Allowed origins configured: ${allowedOrigins.join(
        ", ",
      )}`,
    );

    const corsOptions = {
      origin: (origin, callback) => {
        console.log(
          `[BACKEND-CORS-DEBUG] 1. Incoming request from origin: ${origin}`,
        );
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
          console.log(`[BACKEND-CORS-DEBUG] 2. SUCCESS: Origin is allowed.`);
          callback(null, true);
        } else {
          console.error(
            `[BACKEND-CORS-DEBUG] 2. FAILURE: Origin is NOT in the allowed list.`,
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
    /**
     * Meta's Deauthorize and Data Deletion Request callbacks. These are called by
     * Meta, not by the browser, so they sit outside the CORS-guarded surface and
     * authenticate themselves with `signed_request`.
     */
    app.use("/api/meta", metaRoutes);

    app.get("/", (req, res) => {
      res.send("Sulio Art API is running...");
    });

    Sentry.setupExpressErrorHandler(app);

    app.use(errorHandler);

    app.listen(PORT, () =>
      console.log(
        `Server running in ${
          process.env.NODE_ENV || "development"
        } mode on port ${PORT}`,
      ),
    );
  } catch (error) {
    Sentry.captureException(error);

    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
