
import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import User from "../model/user.model.js";

const protect = asyncHandler(async (req, res, next) => {
  console.log(
    `--- [BACKEND PROTECT] Middleware hit for: ${req.method} ${req.originalUrl} ---`
  );


  console.log(
    "[BACKEND PROTECT] Incoming Headers:",
    JSON.stringify(req.headers, null, 2)
  );

  
  const authHeader = req.headers.authorization;
  let token;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    console.error("[BACKEND PROTECT] FAILED: No token found in headers.");
   
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    console.log("[BACKEND PROTECT] Token found. Verifying...");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(
      "[BACKEND PROTECT] Token verified successfully for user:",
      decoded.id
    );

    
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      console.error("[BACKEND PROTECT] FAILED: User in token not found in DB.");
      return res
        .status(401)
        .json({ message: "User belonging to this token no longer exists" });
    }

    console.log("[BACKEND PROTECT] User found. Granting access.");
    next();
  } catch (err) {
    console.error("[BACKEND PROTECT] FAILED: Token is not valid.", err.message);
    res.status(401).json({ message: "Token is not valid" });
  }
});

export { protect };
