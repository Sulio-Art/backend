import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import User from "../model/user.model.js";
import Subscription from "../model/subscription.Model.js";
import { generateToken } from "./auth.Controlller.js";
import asyncHandler from "express-async-handler";

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID;
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI;

/**
 * Handles the initial login/registration flow when a user clicks "Login with Instagram".
 * (This function is unchanged and correct)
 */
export const handleBusinessLogin = asyncHandler(async (req, res) => {
  const { code } = req.body;

  if (!code) {
    res.status(400);
    throw new Error("Instagram authorization code is required.");
  }

  const tokenFormData = new URLSearchParams({
    client_id: INSTAGRAM_APP_ID,
    client_secret: INSTAGRAM_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: INSTAGRAM_REDIRECT_URI,
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
    console.error("Instagram Token API Error:", tokenData);
    throw new Error(
      tokenData.error_message ||
        "Failed to get short-lived token from Instagram."
    );
  }

  const shortLivedToken = tokenData.access_token;
  const instagramAppScopedId = tokenData.user_id;

  const longLivedTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;
  const longLivedTokenResponse = await fetch(longLivedTokenUrl);
  const longLivedTokenData = await longLivedTokenResponse.json();

  if (!longLivedTokenResponse.ok) {
    console.error("Instagram Long-Lived Token API Error:", longLivedTokenData);
    throw new Error(
      longLivedTokenData.error.message || "Failed to get long-lived token."
    );
  }

  const longLivedToken = longLivedTokenData.access_token;

  const profileUrl = `https://graph.instagram.com/${instagramAppScopedId}?fields=id,username&access_token=${longLivedToken}`;
  const profileResponse = await fetch(profileUrl);
  const profileData = await profileResponse.json();

  if (!profileResponse.ok) {
    console.error("Instagram Profile API Error:", profileData);
    throw new Error(
      profileData.error.message || "Failed to fetch Instagram profile."
    );
  }

  let user = await User.findOne({ instagramUserId: profileData.id });

  if (user) {
    user.instagramAccessToken = longLivedToken;
    await user.save();
    const appToken = generateToken(user._id);
    const subscription = await Subscription.findOne({ userId: user._id });
    const subscriptionStatus = subscription ? subscription.status : "expired";
    res.status(200).json({
      message: "Instagram login successful",
      token: appToken,
      user: {
        _id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        currentPlan: user.currentPlan,
        subscriptionStatus: subscriptionStatus,
      },
    });
  } else {
    const partialTokenPayload = {
      instagramId: profileData.id,
      instagramUsername: profileData.username,
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
        firstName: profileData.username,
        lastName: "",
      },
    });
  }
});

/**
 * Connects an Instagram account to an ALREADY LOGGED-IN user.
 * This is used in the modal popup flow after a user has already created an account.
 */
export const connectInstagramAccount = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const loggedInUserId = req.user.id;

  if (!code) {
    res.status(400);
    throw new Error("Instagram authorization code is required.");
  }

  // Your original, correct OAuth logic
  const tokenFormData = new URLSearchParams({
    client_id: INSTAGRAM_APP_ID,
    client_secret: INSTAGRAM_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: INSTAGRAM_REDIRECT_URI,
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
      tokenData.error_message || "Failed to connect with Instagram."
    );
  }

  const shortLivedToken = tokenData.access_token;
  const instagramAppScopedId = tokenData.user_id;

  const longLivedTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;
  const longLivedTokenResponse = await fetch(longLivedTokenUrl);
  const longLivedTokenData = await longLivedTokenResponse.json();
  if (!longLivedTokenResponse.ok) {
    throw new Error(
      longLivedTokenData.error.message || "Failed to get long-lived token."
    );
  }
  const longLivedToken = longLivedTokenData.access_token;

  const fields =
    "id,username,profile_picture_url,followers_count,biography,website";
  const profileApiUrl = `https://graph.instagram.com/${instagramAppScopedId}?fields=${fields}&access_token=${longLivedToken}`;
  const profileResponse = await fetch(profileApiUrl);
  const profileData = await profileResponse.json();
  if (!profileResponse.ok) {
    throw new Error(
      profileData.error.message || "Failed to fetch Instagram profile data."
    );
  }

  const updatedUser = await User.findByIdAndUpdate(
    loggedInUserId,
    {
      instagramUserId: profileData.id,
      instagramAccessToken: longLivedToken,
      instagramUsername: profileData.username,
      instagramProfilePictureUrl: profileData.profile_picture_url || null,
      instagramFollowersCount: profileData.followers_count || 0,
      instagramBio: profileData.biography || null,
      instagramWebsite: profileData.website || null,
    },
    { new: true }
  );

  if (!updatedUser) {
    throw new Error("User not found during update.");
  }

  // Generate a new JWT with the updated user information
  const newToken = generateToken(updatedUser._id);

  // Send this new token back to the frontend
  res.status(200).json({
    success: true,
    message: "Instagram account connected successfully.",
    token: newToken,
  });
});

/**
 * Retrieves the connected Instagram profile details for the logged-in user.
 * (This function is unchanged and correct)
 */
export const getInstagramProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user || !user.instagramUserId) {
    return res
      .status(404)
      .json({ message: "Instagram profile not connected for this user." });
  }
  res.status(200).json({
    id: user.instagramUserId,
    username: user.instagramUsername,
    profile_picture_url: user.instagramProfilePictureUrl,
    followers_count: user.instagramFollowersCount,
    biography: user.instagramBio,
    website: user.instagramWebsite,
  });
});