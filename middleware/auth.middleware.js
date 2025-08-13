import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import User from "../model/user.model.js";
import Subscription from "../model/subscription.Model.js";

const protect = asyncHandler(async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    res.status(401);
    throw new Error("No token, authorization denied");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      res.status(401);
      throw new Error("User belonging to this token no longer exists");
    }

    // Check and update subscription status on every request
    const subscription = await Subscription.findOne({ userId: req.user._id });

    // If trial is found and has expired, update its status
    if (
      subscription &&
      subscription.status === "trial" &&
      new Date() > new Date(subscription.endDate)
    ) {
      subscription.status = "expired";
      await subscription.save();

      // Also downgrade the user's plan in the User model
      req.user.currentPlan = "free";
      await req.user.save();
    }

    // Attach the most current subscription status to the request user object
    req.user.subscriptionStatus = subscription
      ? subscription.status
      : "expired";

    next();
  } catch (err) {
    res.status(401).json({ message: "Token is not valid" });
  }
});

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403);
    throw new Error("Not authorized as an admin");
  }
};

export { protect, isAdmin };
