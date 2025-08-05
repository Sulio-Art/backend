import User from "../model/user.model.js";
import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import sendEmail from "../utils/sendEmails.js";
import fetch from "node-fetch";

export const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

export const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phoneNumber, password } = req.body;
  console.log("[BACKEND]: Received registration request for:", email);

  let user = await User.findOne({ email });
  if (user) {
    res.status(400);
    throw new Error("User with this email already exists");
  }

  const otp = crypto.randomInt(100000, 999999).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  user = new User({
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    otp,
    otpExpires,
    trialEndsAt,
    currentPlan: "premium",
  });

  await user.save();

  try {
    await sendEmail(
      email,
      "Verify Your Email for Sulio AI",
      `Your verification OTP is: ${otp}\nThis code will expire in 10 minutes.`
    );
    console.log(`[BACKEND]: OTP sent to ${email}`);
    res.status(201).json({
      message: "Registration successful. An OTP has been sent to your email.",
    });
  } catch (emailError) {
    console.error(
      `[BACKEND]: Failed to send OTP email to ${email}. Error: ${emailError.message}`
    );
    res.status(201).json({
      message:
        "Registration successful, but there was an issue sending the OTP email. Please try verifying later.",
    });
  }
});

export const login = asyncHandler(async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(`[Login Attempt] For email: ${email}`);

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      console.log(`[Login Failure] Invalid credentials for email: ${email}`);
      return res.status(401).json({ message: "Invalid email or password" });
    }
    if (!user.isVerified) {
      console.log(`[Login Failure] Account not verified for email: ${email}`);
      return res.status(401).json({
        message: "Email not verified. Please check your email for an OTP.",
      });
    }

    const token = generateToken(user._id);
    console.log(`[Login Success] User logged in successfully: ${email}`);
    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        subscriptionStatus: user.subscriptionStatus,
        trialEndsAt: user.trialEndsAt,
        currentPlan: user.currentPlan,
      },
    });
  } catch (error) {
    console.error("[Login Controller Crash]", error);
    res
      .status(500)
      .json({ message: "An unexpected internal server error occurred." });
  }
});

export const loginWithInstagram = asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) {
    res.status(400);
    throw new Error("Instagram authorization code is required.");
  }

  console.log("[BACKEND] Received Instagram code. Initiating OAuth flow...");

  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  if (!redirectUri) {
    res.status(500);
    throw new Error("INSTAGRAM_REDIRECT_URI is not defined in backend .env");
  }

  const tokenFormData = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    client_secret: process.env.INSTAGRAM_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code: code,
  });

  const tokenResponse = await fetch(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      body: tokenFormData,
    }
  );
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(
      tokenData.error_message || "Failed to get token from Instagram."
    );
  }

  const shortLivedToken = tokenData.access_token;
  const longLivedTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;
  const longLivedTokenResponse = await fetch(longLivedTokenUrl);
  const longLivedTokenData = await longLivedTokenResponse.json();
  const longLivedToken = longLivedTokenData.access_token || shortLivedToken;

  const fields = "id,username,name";
  const profileResponse = await fetch(
    `https://graph.instagram.com/me?fields=${fields}&access_token=${longLivedToken}`
  );
  const profileData = await profileResponse.json();
  if (!profileResponse.ok) {
    throw new Error(
      profileData.error.message || "Failed to fetch Instagram profile."
    );
  }

  let user = await User.findOne({ instagramUserId: profileData.id });

  if (user) {
    user.instagramAccessToken = longLivedToken;
    await user.save();
    console.log(
      `Found existing user for IG ID ${profileData.id}. Token updated.`
    );
    const appToken = generateToken(user._id);
    res.status(200).json({
      message: "Instagram login successful",
      token: appToken,
      user: {
        _id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
      },
    });
  } else {
    console.log(
      `New user from Instagram ID ${profileData.id}. Initiating profile completion.`
    );
    const partialTokenPayload = {
      instagramId: profileData.id,
      instagramUsername: profileData.username,
      firstName: profileData.name
        ? profileData.name.split(" ")[0]
        : profileData.username,
      lastName: profileData.name
        ? profileData.name.split(" ").slice(1).join(" ")
        : "",
      instagramAccessToken: longLivedToken,
    };
    const completionToken = jwt.sign(
      partialTokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.status(201).json({
      message: "User profile needs completion.",
      completionToken: completionToken,
      prefill: {
        firstName: partialTokenPayload.firstName,
        lastName: partialTokenPayload.lastName,
      },
    });
  }
});

export const completeInstagramRegistration = asyncHandler(async (req, res) => {
  const { completionToken, phoneNumber, password, firstName, lastName, email } =
    req.body;
  if (
    !completionToken ||
    !phoneNumber ||
    !password ||
    !firstName ||
    !lastName ||
    !email
  ) {
    res.status(400);
    throw new Error("All fields and completion token are required.");
  }

  let decoded;
  try {
    decoded = jwt.verify(completionToken, process.env.JWT_SECRET);
  } catch (err) {
    res.status(401);
    throw new Error("Invalid or expired completion token.");
  }

  const { instagramId, instagramUsername, instagramAccessToken } = decoded;

  let user = await User.findOne({
    $or: [{ instagramUserId: instagramId }, { email: email }],
  });
  if (user) {
    res.status(409);
    throw new Error(
      "An account is already associated with this Instagram profile or email."
    );
  }

  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  user = new User({
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    instagramUserId: instagramId,
    instagramUsername: instagramUsername,
    instagramAccessToken: instagramAccessToken,
    isVerified: true,
    trialEndsAt,
    currentPlan: "premium",
  });

  await user.save();
  console.log(`Successfully created full user for Instagram ID ${instagramId}`);

  const finalToken = generateToken(user._id);

  res.status(201).json({
    message: "Registration complete. Welcome!",
    token: finalToken,
    user: {
      _id: user._id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
    },
  });
});

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("No user found with this email");
  }
  const otp = crypto.randomInt(100000, 999999).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

  user.otp = otp;
  user.otpExpires = otpExpires;
  await user.save();
  await sendEmail(
    email,
    "Your Password Reset OTP",
    `Your password reset OTP is: ${otp}\nThis code will expire in 10 minutes.`
  );
  res
    .status(200)
    .json({ message: "OTP for password reset sent to your email." });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (user.otp !== otp || user.otpExpires < Date.now()) {
    res.status(400);
    throw new Error("Invalid or expired OTP");
  }
  user.password = newPassword;
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();
  res
    .status(200)
    .json({ message: "Password reset successful. You can now login." });
});

export const logout = asyncHandler(async (req, res) => {
  res.cookie("token", "", {
    httpOnly: true,
    expires: new Date(0),
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.status(200).json({ message: "Logged out successfully" });
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  if (user) {
    res.status(200).json({
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        subscriptionStatus: user.subscriptionStatus,
        trialEndsAt: user.trialEndsAt,
        currentPlan: user.currentPlan,
      },
    });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});