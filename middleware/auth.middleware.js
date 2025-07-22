import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import User from "../model/user.model.js";

const protect = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res
        .status(401)
        .json({ message: "User belonging to this token no longer exists" });
    }

    next();
  } catch (err) {
    res.status(401).json({ message: "Token is not valid" });
  }
});

export { protect };
