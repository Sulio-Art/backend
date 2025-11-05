import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import User from "../model/user.model.js";
import { generateToken } from "./auth.Controlller.js";
import asyncHandler from "express-async-handler";

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID;
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI;

export const getInstagramAuthUrl = asyncHandler(async (req, res) => {
  const { state } = req.query;
  if (!state || !["login", "connect"].includes(state)) {
    res
      .status(400)
      .throw(
        new Error(
          "A valid 'state' parameter ('login' or 'connect') is required."
        )
      );
  }
  const authUrl = new URL("https://www.instagram.com/oauth/authorize");
  authUrl.searchParams.set("client_id", INSTAGRAM_APP_ID);
  authUrl.searchParams.set("redirect_uri", INSTAGRAM_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  const scopes = [
    "instagram_business_basic",
    "instagram_business_content_publish",
    "instagram_business_manage_comments",
    "instagram_business_manage_messages",
  ];
  authUrl.searchParams.set("scope", scopes.join(","));
  authUrl.searchParams.set("state", state);
  console.log(
    `[getInstagramAuthUrl] Generated auth URL for state '${state}': ${authUrl.toString()}`
  );
  res.status(200).json({ authUrl: authUrl.toString() });
});

export const handleBusinessLogin = asyncHandler(async (req, res) => {
  console.log("\n--- [handleBusinessLogin] START ---");
  const { code } = req.body;
  if (!code) {
    console.error(
      "[handleBusinessLogin] ERROR: No authorization code provided."
    );
    res.status(400);
    throw new Error("Instagram authorization code is required.");
  }
  console.log("[handleBusinessLogin] 1. Received authorization code.");

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
    console.error(
      "[handleBusinessLogin] ERROR from Instagram token API:",
      tokenData
    );
    throw new Error(
      tokenData.error_message ||
        "Failed to get short-lived token from Instagram."
    );
  }
  let shortLivedToken, instagramAppScopedId;
  if (tokenData.access_token && tokenData.user_id) {
    shortLivedToken = tokenData.access_token;
    instagramAppScopedId = tokenData.user_id;
  } else if (
    tokenData.data &&
    tokenData.data[0] &&
    tokenData.data[0].access_token
  ) {
    shortLivedToken = tokenData.data[0].access_token;
    instagramAppScopedId = tokenData.data[0].user_id;
  } else {
    console.error("Unknown Instagram token response format:", tokenData);
    throw new Error(
      "Could not parse the access token from Instagram's response."
    );
  }

  const longLivedTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;
  const longLivedTokenResponse = await fetch(longLivedTokenUrl);
  const longLivedTokenData = await longLivedTokenResponse.json();
  if (!longLivedTokenResponse.ok) {
    console.error(
      "[handleBusinessLogin] ERROR from Instagram long-lived token API:",
      longLivedTokenData
    );
    throw new Error(
      longLivedTokenData.error.message || "Failed to get long-lived token."
    );
  }
  const longLivedToken = longLivedTokenData.access_token;
  console.log(
    "[handleBusinessLogin] 3. Successfully received long-lived token."
  );

  const profileUrl = `https://graph.instagram.com/${instagramAppScopedId}?fields=id,username&access_token=${longLivedToken}`;
  const profileResponse = await fetch(profileUrl);
  const profileData = await profileResponse.json();
  if (!profileResponse.ok) {
    console.error(
      "[handleBusinessLogin] ERROR from Instagram profile API:",
      profileData
    );
    throw new Error(
      profileData.error.message || "Failed to fetch Instagram profile."
    );
  }
  console.log(
    "[handleBusinessLogin] 4. Successfully received profile data:",
    profileData
  );

  console.log(
    `[handleBusinessLogin] 5. Checking database for user with Instagram ID: ${profileData.id}`
  );
  let user = await User.findOne({ instagramUserId: profileData.id });

  if (user) {
    console.log(
      `[handleBusinessLogin] 6a. User FOUND. ID: ${user._id}. Logging them in.`
    );
    user.instagramAccessToken = longLivedToken;
    await user.save();
    const appToken = generateToken(user._id);
    console.log("[handleBusinessLogin] 7a. Sending 200 OK with login token.");
    console.log("--- [handleBusinessLogin] END ---\n");
    res.status(200).json({
      message: "Instagram login successful",
      token: appToken,
      user: {
        _id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        subscriptionStatus: user.subscriptionStatus, // You might need to populate this
        currentPlan: user.currentPlan,
        instagramUserId: user.instagramUserId,
        role: user.role,
      },
    });
  } else {
    console.log(
      "[handleBusinessLogin] 6b. User NOT FOUND. Preparing for registration completion."
    );
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
    console.log(
      "[handleBusinessLogin] 7b. Sending 201 Created with completionToken."
    );
    console.log("--- [handleBusinessLogin] END ---\n");
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

export const connectInstagramAccount = asyncHandler(async (req, res) => {
  console.log("\n--- [CONNECT INSTAGRAM] START ---");
  const { code } = req.body;
  const loggedInUserId = req.user.id;

  console.log(
    `[CONNECT INSTAGRAM] 1. Received request for user ID: ${loggedInUserId}`
  );
  if (!code) {
    console.error("[CONNECT INSTAGRAM] ERROR: No authorization code provided.");
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
    { method: "POST", body: tokenFormData }
  );
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    console.error(
      "[CONNECT INSTAGRAM] ERROR from Instagram token API:",
      tokenData
    );
    throw new Error(
      tokenData.error_message || "Failed to connect with Instagram."
    );
  }
  console.log(
    "[CONNECT INSTAGRAM] 2. Successfully received short-lived token from Instagram."
  );

  const shortLivedToken = tokenData.access_token;
  const longLivedTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;
  const longLivedTokenResponse = await fetch(longLivedTokenUrl);
  const longLivedTokenData = await longLivedTokenResponse.json();
  if (!longLivedTokenResponse.ok) {
    console.error(
      "[CONNECT INSTAGRAM] ERROR from Instagram long-lived token API:",
      longLivedTokenData
    );
    throw new Error(
      longLivedTokenData.error.message || "Failed to get long-lived token."
    );
  }
  const longLivedToken = longLivedTokenData.access_token;
  console.log("[CONNECT INSTAGRAM] 3. Successfully received long-lived token.");

  // [START] >>>>>>>>>> NEW LOGIC ADDED HERE <<<<<<<<<<
  let meData = {}; // Initialize to an empty object to ensure it's defined
  console.log(
    "[CONNECT INSTAGRAM] 3a. Performing new request to /me endpoint for review."
  );
  try {
    const meApiUrl = `https://graph.instagram.com/me?fields=id,user_id&access_token=${longLivedToken}`;
    const meResponse = await fetch(meApiUrl);
    meData = await meResponse.json(); // Assign the response to meData

    if (!meResponse.ok) {
      console.error("[CONNECT INSTAGRAM] ERROR from /me endpoint:", meData);
      meData = {}; // Reset on error to prevent saving faulty data
    } else {
      console.log(
        "[CONNECT INSTAGRAM] 3b. Successfully received data from /me endpoint:",
        meData
      );
    }
  } catch (err) {
    console.error(
      "[CONNECT INSTAGRAM] CATCH BLOCK ERROR during /me request:",
      err
    );
  }
  // [END] >>>>>>>>>> END OF ADDED LOGIC <<<<<<<<<<

  const instagramAppScopedId = tokenData.user_id;
  const fields =
    "id,username,profile_picture_url,followers_count,biography,website";
  const profileApiUrl = `https://graph.instagram.com/${instagramAppScopedId}?fields=${fields}&access_token=${longLivedToken}`;
  const profileResponse = await fetch(profileApiUrl);
  const profileData = await profileResponse.json();
  if (!profileResponse.ok) {
    console.error(
      "[CONNECT INSTAGRAM] ERROR from Instagram profile API:",
      profileData
    );
    throw new Error(
      profileData.error.message || "Failed to fetch Instagram profile data."
    );
  }
  console.log(
    "[CONNECT INSTAGRAM] 4. Successfully received profile data:",
    profileData
  );

  console.log(
    `[CONNECT INSTAGRAM] 5. Finding user with MongoDB ID: ${loggedInUserId}`
  );
  const userToUpdate = await User.findById(loggedInUserId);
  if (!userToUpdate) {
    console.error(
      `[CONNECT INSTAGRAM] FATAL ERROR: User with ID ${loggedInUserId} not found in database.`
    );
    res.status(404);
    throw new Error("User to connect was not found in the database.");
  }
  console.log(
    "[CONNECT INSTAGRAM] 6. Found user. Current IG User ID:",
    userToUpdate.instagramUserId
  );

  // [START] >>>>>>>>>> NEW DATA ASSIGNMENT ADDED HERE <<<<<<<<<<
  userToUpdate.instagramUserId = profileData.id;
  userToUpdate.instagramAccessToken = longLivedToken;
  userToUpdate.instagramUsername = profileData.username;
  userToUpdate.instagramProfilePictureUrl =
    profileData.profile_picture_url || null;
  userToUpdate.instagramFollowersCount = profileData.followers_count || 0;
  userToUpdate.instagramBio = profileData.biography || null;
  userToUpdate.instagramWebsite = profileData.website || null;

  // Assign the new IDs from the /me endpoint
  userToUpdate.igid = meData.user_id || null; // "user_id" is saved as "igid"
  userToUpdate.asid = meData.id || null; // "id" is saved as "asid"

  console.log(
    "[CONNECT INSTAGRAM] 7. Assigned new data to user object. Preparing to save..."
  );
  console.log(`   - Saving igid: ${userToUpdate.igid}`);
  console.log(`   - Saving asid: ${userToUpdate.asid}`);
  // [END] >>>>>>>>>> END OF DATA ASSIGNMENT <<<<<<<<<<

  await userToUpdate.save();
  console.log("[CONNECT INSTAGRAM] 8. Save operation complete.");

  console.log(
    "[CONNECT INSTAGRAM] 9. Sending simple success response to frontend."
  );
  console.log("--- [CONNECT INSTAGRAM] END ---\n");

  res.status(200).json({
    success: true,
    message: "Instagram account connected successfully.",
  });
});

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
