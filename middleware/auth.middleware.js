import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import User from "../model/user.model.js";

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

    const now = new Date();
    if (
      req.user.subscriptionStatus === "free_trial" &&
      req.user.trialEndsAt &&
      now > req.user.trialEndsAt
    ) {
      console.log(
        `[BACKEND PROTECT] Trial expired for user: ${req.user.email}. Downgrading.`
      );

      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        {
          subscriptionStatus: "trial_expired",
          currentPlan: "basic",
        },
        { new: true }
      ).select("-password");

      req.user = updatedUser;
    }

    next();
  } catch (err) {
    console.error("[BACKEND PROTECT] FAILED:", err.message);
    res.status(401).json({ message: "Token is not valid" });
  }
});

export { protect };
