import fetch from "node-fetch";
import User from "../model/user.model.js";

export const connectInstagramAccount = async (req, res) => {
  const { code } = req.body;
  const loggedInUserId = req.user.id;

  if (!code) {
    res.status(400);
    throw new Error("Instagram authorization code is required.");
  }

  if (!loggedInUserId) {
    res.status(401);
    throw new Error("User must be logged in to connect an account.");
  }

  try {
    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

    if (!appId || !appSecret || !redirectUri) {
      throw new Error(
        "Server configuration error: Instagram environment variables are missing."
      );
    }

    const tokenFormData = new URLSearchParams();
    tokenFormData.append("client_id", appId);
    tokenFormData.append("client_secret", appSecret);
    tokenFormData.append("grant_type", "authorization_code");
    tokenFormData.append("redirect_uri", redirectUri);
    tokenFormData.append("code", code);

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
        tokenData.error_message ||
          `Instagram API Error: ${tokenResponse.statusText}`
      );
    }

    let shortLivedToken, instagramAppScopedId;
    if (tokenData.data && tokenData.data.length > 0) {
      shortLivedToken = tokenData.data[0].access_token;
      instagramAppScopedId = tokenData.data[0].user_id;
    } else if (tokenData.access_token && tokenData.user_id) {
      shortLivedToken = tokenData.access_token;
      instagramAppScopedId = tokenData.user_id;
    } else {
      throw new Error(
        "Could not find access_token and user_id in Instagram response."
      );
    }

    const longLivedTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`;
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

    await User.findByIdAndUpdate(loggedInUserId, {
      instagramUserId: profileData.id,
      instagramAccessToken: longLivedToken,
      instagramUsername: profileData.username,
      instagramProfilePictureUrl: profileData.profile_picture_url || null,
      instagramFollowersCount: profileData.followers_count || 0,
      instagramBio: profileData.biography || null,
      instagramWebsite: profileData.website || null,
    });

    res.status(200).json({
      success: true,
      message: "Instagram account connected successfully.",
    });
  } catch (error) {
    console.error(
      "BACKEND: A critical error occurred during the Instagram connect process:",
      error.message
    );
    res
      .status(500)
      .json({ message: error.message || "An internal server error occurred." });
  }
};

export const getInstagramProfile = async (req, res) => {
  try {
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
      followers_count: user.followers_count,
      biography: user.instagramBio,
      website: user.instagramWebsite,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error while fetching profile." });
  }
};
