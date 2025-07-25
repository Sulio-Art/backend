

import fetch from "node-fetch";
import User from "../model/user.model.js";
import { generateToken } from "./auth.Controlller.js";

export const connectInstagramAccount = async (req, res) => {
  const { code } = req.body;
  const loggedInUserId = req.user.id;

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

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Instagram API Error: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();

    const longLivedTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${tokenData.access_token}`;
    const longLivedTokenResponse = await fetch(longLivedTokenUrl);
    const longLivedTokenData = await longLivedTokenResponse.json();
    if (!longLivedTokenResponse.ok) {
      throw new Error(
        longLivedTokenData.error.message || "Failed to get long-lived token."
      );
    }

    const fields =
      "id,username,profile_picture_url,followers_count,biography,website";
    const profileApiUrl = `https://graph.instagram.com/${tokenData.user_id}?fields=${fields}&access_token=${longLivedTokenData.access_token}`;
    const profileResponse = await fetch(profileApiUrl);
    const profileData = await profileResponse.json();
    if (!profileResponse.ok) {
      throw new Error(
        profileData.error.message || "Failed to fetch Instagram profile data."
      );
    }

    await User.findByIdAndUpdate(loggedInUserId, {
      instagramUserId: profileData.id,
      instagramAccessToken: longLivedTokenData.access_token,
      instagramUsername: profileData.username,
      instagramProfilePictureUrl: profileData.profile_picture_url,
      instagramFollowersCount: profileData.followers_count,
      instagramBio: profileData.biography,
      instagramWebsite: profileData.website,
    });

   
    const permanentToken = generateToken(req.user.id);

    res.status(200).json({
      success: true,
      message: "Instagram account connected successfully.",
      token: permanentToken, 
      user: req.user,
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
