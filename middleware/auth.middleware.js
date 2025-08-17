import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import { syncUserWithSubscription } from "../services/subscriptionSync.Service.js";

export const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    !(
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    )
  ) {
    res.status(401);
    throw new Error("Not authorized, no token");
  }

  try {
    token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.id) {
      res.status(401);
      throw new Error("Not authorized, token invalid");
    }

    const { user, subscription } = await syncUserWithSubscription(decoded.id);

    if (!user) {
      res.status(401);
      throw new Error("User not found.");
    }

    req.user = user;
    req.subscription = subscription;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);
    res.status(401);
    throw new Error("Not authorized, token failed");
  }
});

export const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403);
    throw new Error("Not authorized as an admin");
  }
};