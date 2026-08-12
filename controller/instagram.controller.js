import fetch from "node-fetch";
import User from "../model/user.model.js";
import { generateToken } from "./auth.Controlller.js";
import asyncHandler from "express-async-handler";
import {
  issueOAuthState,
  consumeOAuthState,
  createRegistrationHandoff,
} from "../utils/oauthHandoff.js";

const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID;
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI;

export const getInstagramAuthUrl = asyncHandler(async (req, res) => {
  // `intent` is what `state` used to be: which flow the caller wants. The value
  // actually sent to Instagram now also carries a single-use nonce.
  const intent = req.query.intent || req.query.state;

  if (!intent || !["login", "connect"].includes(intent)) {
    res.status(400);
    throw new Error(
      "A valid 'intent' parameter ('login' or 'connect') is required.",
    );
  }

  // Connecting an account has to be tied to the session asking for it, otherwise
  // the callback cannot be checked against anything on the way back.
  if (intent === "connect" && !req.user?.id) {
    res.status(401);
    throw new Error("You must be signed in to connect an Instagram account.");
  }

  const state = await issueOAuthState(
    intent,
    intent === "connect" ? req.user.id : null,
  );

  const authUrl = new URL("https://www.instagram.com/oauth/authorize");
  authUrl.searchParams.set("client_id", INSTAGRAM_APP_ID);
  authUrl.searchParams.set("redirect_uri", INSTAGRAM_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  /**
   * `instagram_business_content_publish` is deliberately absent: no publishing
   * code exists, and Meta's Data Use Checkup requires every requested permission
   * to be in active use. Add it back in the same change that ships publishing.
   */
  const scopes = ["instagram_business_basic"];
  authUrl.searchParams.set("scope", scopes.join(","));
  authUrl.searchParams.set("state", state);

  // The URL contains a live nonce, so it is not logged.
  console.log(`[getInstagramAuthUrl] Issued auth URL for intent '${intent}'.`);
  res.status(200).json({ authUrl: authUrl.toString() });
});

export const handleBusinessLogin = asyncHandler(async (req, res) => {
  console.log("\n--- [handleBusinessLogin] START ---");
  const { code, state } = req.body;
  if (!code) {
    console.error(
      "[handleBusinessLogin] ERROR: No authorization code provided.",
    );
    res.status(400);
    throw new Error("Instagram authorization code is required.");
  }

  /**
   * Burn the nonce before spending an authorization code. A login callback that
   * cannot present a nonce we issued is a forged request — without this check an
   * attacker can force a victim's browser to complete a login with the
   * attacker's code.
   */
  await consumeOAuthState(state, "login");
  console.log("[handleBusinessLogin] 1. Verified state; received code.");

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
    },
  );
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    // Only the message — the body of this response contains an access token.
    console.error(
      "[handleBusinessLogin] Instagram token API error:",
      tokenData.error_message || tokenData.error?.message || "unknown error",
    );
    throw new Error(
      tokenData.error_message ||
        "Failed to get short-lived token from Instagram.",
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
    console.error(
      "[handleBusinessLogin] Unrecognised Instagram token response shape; keys:",
      Object.keys(tokenData || {}).join(","),
    );
    throw new Error(
      "Could not parse the access token from Instagram's response.",
    );
  }

  const longLivedTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;
  const longLivedTokenResponse = await fetch(longLivedTokenUrl);
  const longLivedTokenData = await longLivedTokenResponse.json();
  if (!longLivedTokenResponse.ok) {
    console.error(
      "[handleBusinessLogin] Instagram long-lived token API error:",
      longLivedTokenData.error?.message || "unknown error",
    );
    throw new Error(
      longLivedTokenData.error?.message || "Failed to get long-lived token.",
    );
  }
  const longLivedToken = longLivedTokenData.access_token;
  // Recorded so the refresh sweep has something to work from (plan 2.4).
  const tokenExpiresAt = longLivedTokenData.expires_in
    ? new Date(Date.now() + Number(longLivedTokenData.expires_in) * 1000)
    : null;
  console.log(
    "[handleBusinessLogin] 3. Successfully received long-lived token.",
  );

  const profileUrl = `https://graph.instagram.com/${instagramAppScopedId}?fields=id,username,profile_picture_url,followers_count,biography,website&access_token=${longLivedToken}`;
  const profileResponse = await fetch(profileUrl);
  const profileData = await profileResponse.json();
  if (!profileResponse.ok) {
    console.error(
      "[handleBusinessLogin] Instagram profile API error:",
      profileData.error?.message || "unknown error",
    );
    throw new Error(
      profileData.error?.message || "Failed to fetch Instagram profile.",
    );
  }
  // Profile payloads are Platform Data (biography, website, follower counts) and
  // are not logged.
  console.log("[handleBusinessLogin] 4. Received profile data.");

  const meApiUrl = `https://graph.instagram.com/me?fields=id,user_id&access_token=${longLivedToken}`;
  const meResponse = await fetch(meApiUrl);
  const meData = await meResponse.json();

  console.log("[handleBusinessLogin] 5. Looking up local user.");
  let user = await User.findOne({ instagramUserId: profileData.id });

  if (user) {
    console.log(
      `[handleBusinessLogin] 6a. User FOUND. ID: ${user._id}. Logging them in.`,
    );
    user.instagramUserId = profileData.id;
    user.instagramAccessToken = longLivedToken;
    user.instagramUsername = profileData.username;
    user.instagramProfilePictureUrl = profileData.profile_picture_url || null;
    user.instagramFollowersCount = profileData.followers_count || 0;
    user.instagramBio = profileData.biography || null;
    user.instagramWebsite = profileData.website || null;
    user.igid = meData.user_id || null;
    user.asid = meData.id || null;
    if (tokenExpiresAt) user.instagramTokenExpiresAt = tokenExpiresAt;
    await user.save();
    const appToken = generateToken(user._id);
    console.log("[handleBusinessLogin] 7a. Sending 200 OK with login token.");
    console.log("--- [handleBusinessLogin] END ---\n");
    res.status(200).json({
      message: "Instagram login successful",
      backendToken: appToken,
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
      "[handleBusinessLogin] 6b. User NOT FOUND. Preparing for registration completion.",
    );
    /**
     * The Instagram token stays here, on the server. The browser gets an opaque
     * single-use id instead — the previous version signed the token into a JWT
     * payload, which is readable base64, so the user's long-lived access token
     * was effectively published to the client.
     */
    const handoffId = await createRegistrationHandoff({
      instagramUserId: profileData.id,
      instagramUsername: profileData.username,
      instagramAccessToken: longLivedToken,
      profileSnapshot: profileData,
      igid: meData.user_id || null,
      asid: meData.id || null,
    });

    console.log(
      "[handleBusinessLogin] 6b. No local user; issued registration handoff.",
    );
    console.log("--- [handleBusinessLogin] END ---\n");
    res.status(201).json({
      message: "User profile needs completion.",
      handoffId,
      prefill: {
        firstName: profileData.username,
        lastName: "",
      },
    });
  }
});

export const connectInstagramAccount = asyncHandler(async (req, res) => {
  console.log("\n--- [CONNECT INSTAGRAM] START ---");
  const { code, state } = req.body;
  const loggedInUserId = req.user.id;

  console.log(
    `[CONNECT INSTAGRAM] 1. Received request for user ID: ${loggedInUserId}`,
  );
  if (!code) {
    console.error("[CONNECT INSTAGRAM] ERROR: No authorization code provided.");
    res.status(400);
    throw new Error("Instagram authorization code is required.");
  }

  /**
   * The nonce must have been issued to this same session. This is the check that
   * closes the takeover chain: previously any code could be replayed into any
   * logged-in victim's browser, rewriting their `instagramUserId` to the
   * attacker's, after which the attacker could log in as them.
   */
  await consumeOAuthState(state, "connect", loggedInUserId);
  console.log("[CONNECT INSTAGRAM] 1b. Verified state nonce for this session.");

  const tokenFormData = new URLSearchParams({
    client_id: INSTAGRAM_APP_ID,
    client_secret: INSTAGRAM_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: INSTAGRAM_REDIRECT_URI,
    code: code,
  });

  const tokenResponse = await fetch(
    "https://api.instagram.com/oauth/access_token",
    { method: "POST", body: tokenFormData },
  );
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    console.error(
      "[CONNECT INSTAGRAM] Instagram token API error:",
      tokenData.error_message || tokenData.error?.message || "unknown error",
    );
    throw new Error(
      tokenData.error_message || "Failed to connect with Instagram.",
    );
  }
  console.log(
    "[CONNECT INSTAGRAM] 2. Successfully received short-lived token from Instagram.",
  );

  const shortLivedToken = tokenData.access_token;
  const longLivedTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;
  const longLivedTokenResponse = await fetch(longLivedTokenUrl);
  const longLivedTokenData = await longLivedTokenResponse.json();
  if (!longLivedTokenResponse.ok) {
    console.error(
      "[CONNECT INSTAGRAM] Instagram long-lived token API error:",
      longLivedTokenData.error?.message || "unknown error",
    );
    throw new Error(
      longLivedTokenData.error?.message || "Failed to get long-lived token.",
    );
  }
  const longLivedToken = longLivedTokenData.access_token;
  const tokenExpiresAt = longLivedTokenData.expires_in
    ? new Date(Date.now() + Number(longLivedTokenData.expires_in) * 1000)
    : null;
  console.log("[CONNECT INSTAGRAM] 3. Successfully received long-lived token.");

  let meData = {}; // Initialize to an empty object to ensure it's defined
  try {
    const meApiUrl = `https://graph.instagram.com/me?fields=id,user_id&access_token=${longLivedToken}`;
    const meResponse = await fetch(meApiUrl);
    meData = await meResponse.json(); // Assign the response to meData

    if (!meResponse.ok) {
      console.error(
        "[CONNECT INSTAGRAM] /me endpoint error:",
        meData.error?.message || "unknown error",
      );
      meData = {}; // Reset on error to prevent saving faulty data
    } else {
      console.log("[CONNECT INSTAGRAM] 3b. Received /me data.");
    }
  } catch (err) {
    console.error(
      "[CONNECT INSTAGRAM] Exception during /me request:",
      err.message,
    );
  }

  const instagramAppScopedId = tokenData.user_id;
  const fields =
    "id,username,profile_picture_url,followers_count,biography,website";
  const profileApiUrl = `https://graph.instagram.com/${instagramAppScopedId}?fields=${fields}&access_token=${longLivedToken}`;
  const profileResponse = await fetch(profileApiUrl);
  const profileData = await profileResponse.json();
  if (!profileResponse.ok) {
    console.error(
      "[CONNECT INSTAGRAM] Instagram profile API error:",
      profileData.error?.message || "unknown error",
    );
    throw new Error(
      profileData.error?.message || "Failed to fetch Instagram profile data.",
    );
  }
  console.log("[CONNECT INSTAGRAM] 4. Received profile data.");

  /**
   * One Instagram account cannot back two Sulio accounts. Without this, a
   * connect request could point a second user record at an already-linked
   * Instagram id, and `handleBusinessLogin` — which trusts `instagramUserId` as
   * an identity — would then have two candidates for the same login.
   */
  const alreadyLinked = await User.findOne({
    instagramUserId: profileData.id,
  }).select("_id");
  if (alreadyLinked && String(alreadyLinked._id) !== String(loggedInUserId)) {
    console.error(
      "[CONNECT INSTAGRAM] Rejected: Instagram account already linked elsewhere.",
    );
    res.status(409);
    throw new Error(
      "This Instagram account is already linked to another Sulio account.",
    );
  }

  console.log(
    `[CONNECT INSTAGRAM] 5. Finding user with MongoDB ID: ${loggedInUserId}`,
  );
  const userToUpdate = await User.findById(loggedInUserId);
  if (!userToUpdate) {
    console.error(
      `[CONNECT INSTAGRAM] FATAL ERROR: User with ID ${loggedInUserId} not found in database.`,
    );
    res.status(404);
    throw new Error("User to connect was not found in the database.");
  }
  console.log("[CONNECT INSTAGRAM] 6. Found user.");

  userToUpdate.instagramUserId = profileData.id;
  userToUpdate.instagramAccessToken = longLivedToken;
  userToUpdate.instagramUsername = profileData.username;
  userToUpdate.instagramProfilePictureUrl =
    profileData.profile_picture_url || null;
  userToUpdate.instagramFollowersCount = profileData.followers_count || 0;
  userToUpdate.instagramBio = profileData.biography || null;
  userToUpdate.instagramWebsite = profileData.website || null;

  userToUpdate.igid = meData.user_id || null; // "user_id" is saved as "igid"
  userToUpdate.asid = meData.id || null; // "id" is saved as "asid"
  if (tokenExpiresAt) userToUpdate.instagramTokenExpiresAt = tokenExpiresAt;

  await userToUpdate.save();
  console.log("[CONNECT INSTAGRAM] 7. Save operation complete.");
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
