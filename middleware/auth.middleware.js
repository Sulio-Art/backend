import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import User from "../model/user.model.js";
import Subscription from "../model/subscription.Model.js";

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

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      res.status(401);
      throw new Error("User not found");
    }

    let subscription = await Subscription.findOne({ userId: user._id });

    if (!subscription) {
      subscription = await Subscription.create({
        userId: user._id,
        plan: "free",
        status: "active",
        amount: 0,
        billingCycle: "monthly",
        startDate: new Date(),
        endDate: null,
      });
      user.subscriptionId = subscription._id;
      user.currentPlan = "free";
      await user.save();
    }

    let needsUserUpdate = false;

    if (
      subscription.status === "trial" &&
      subscription.endDate &&
      new Date() > new Date(subscription.endDate)
    ) {
      console.log(
        `[Auth Middleware] Trial expired for user ${user._id}. Downgrading.`
      );

      subscription.plan = "free";
      subscription.status = "expired";
      await subscription.save();

      user.currentPlan = "free";
      needsUserUpdate = true;
    }

    if (user.currentPlan !== subscription.plan) {
      console.log(`[Auth Middleware] Syncing user plan for ${user._id}.`);
      user.currentPlan = subscription.plan;
      needsUserUpdate = true;
    }

    if (needsUserUpdate) {
      await user.save();
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