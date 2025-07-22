import fetch from 'node-fetch';
import User from '../model/user.model.js';

export const connectInstagramAccount = async (req, res) => {
  const { code } = req.body;
  const loggedInUserId = req.user.id;

  if (!code) {
    return res.status(400).json({ message: 'Authorization code is required.' });
  }

  try {
    /**
     * =================================================================
     * STEP 1: Exchange Code for Short-Lived Token & User ID
     * =================================================================
     * The user_id is ONLY available in this first API response.
     * The previous code was incorrectly trying to find it in the
     * long-lived token response, which was the source of the error.
     */
    const tokenFormData = new URLSearchParams();
    tokenFormData.append('client_id', process.env.INSTAGRAM_APP_ID);
    tokenFormData.append('client_secret', process.env.INSTAGRAM_APP_SECRET);
    tokenFormData.append('grant_type', 'authorization_code');
    tokenFormData.append('redirect_uri', process.env.INSTAGRAM_REDIRECT_URI);
    tokenFormData.append('code', code);

    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      body: tokenFormData,
    });
    
    const tokenData = await tokenResponse.json();
    if (tokenData.error_message) throw new Error(tokenData.error_message);

    const shortLivedAccessToken = tokenData.access_token;
    // FIX: The user_id is correctly retrieved from THIS response (tokenData).
    const instagramUserId = tokenData.user_id; 

    // --- Exchange for Long-Lived Token ---
    const longLivedTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.INSTAGRAM_APP_SECRET}&access_token=${shortLivedAccessToken};`
    const longLivedTokenResponse = await fetch(longLivedTokenUrl);
    const longLivedTokenData = await longLivedTokenResponse.json();
    if (longLivedTokenData.error) throw new Error(longLivedTokenData.error.message);
    
    const longLivedAccessToken = longLivedTokenData.access_token;
    const expiresIn = longLivedTokenData.expires_in;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    /**
     * =================================================================
     * STEP 2: Fetch Profile Data using the correct User ID
     * =================================================================
     */
    const fields = 'id,username,followers_count,biography,profile_picture_url,website';
    const profileApiUrl = `https://graph.instagram.com/${instagramUserId}?fields=${fields}&access_token=${longLivedAccessToken};`
    const profileResponse = await fetch(profileApiUrl);
    const profileData = await profileResponse.json();
    if (profileData.error) throw new Error(profileData.error.message);

    /**
     * =================================================================
     * STEP 3: Save all data, including the now-correct User ID
     * =================================================================
     */
    await User.findByIdAndUpdate(loggedInUserId, {
      // INFO: This now saves the valid instagramUserId obtained from the fix above.
      instagramUserId: instagramUserId, 
      instagramAccessToken: longLivedAccessToken,
      instagramTokenExpiresAt: expiresAt,
      instagramUsername: profileData.username,
      instagramProfilePictureUrl: profileData.profile_picture_url,
      instagramFollowersCount: profileData.followers_count,
      instagramBio: profileData.biography,
      instagramWebsite: profileData.website
    });

    res.status(200).json({ 
      success: true, 
      message: 'Instagram account connected and profile data saved successfully.' 
    });

  } catch (error) {
    console.error("BACKEND: An error occurred during the Instagram connect process:", error);
    res.status(500).json({ message: error.message || 'An internal server error occurred.' });
  }
};

// INFO: This function did not need changes. It works correctly now
// because the bug in connectInstagramAccount has been fixed.
export const getInstagramProfile = async (req, res) => {
  const loggedInUserId = req.user.id;
  const shouldRefresh = req.query.refresh === 'true';

  try {
    let user = await User.findById(loggedInUserId);

    if (!user || !user.instagramUserId) {
      return res.status(400).json({ message: 'This account has not been connected to Instagram.' });
    }

    if (shouldRefresh) {
      if (new Date() > user.instagramTokenExpiresAt) {
          return res.status(401).json({ message: 'The Instagram token has expired. Please reconnect the account.' });
      }
      
      const { instagramAccessToken, instagramUserId } = user;
      const fields = 'id,username,followers_count,biography,profile_picture_url,website';
      const apiUrl = `https://graph.instagram.com/${instagramUserId}?fields=${fields}&access_token=${instagramAccessToken};`

      const response = await fetch(apiUrl);
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      user = await User.findByIdAndUpdate(loggedInUserId, {
        instagramUsername: data.username,
        instagramProfilePictureUrl: data.profile_picture_url,
        instagramFollowersCount: data.followers_count,
        instagramBio: data.biography,
        instagramWebsite: data.website
      }, { new: true });
    }

    res.status(200).json({
      id: user.instagramUserId,
      username: user.instagramUsername,
      profile_picture_url: user.instagramProfilePictureUrl,
      followers_count: user.instagramFollowersCount,
      biography: user.instagramBio,
      website: user.instagramWebsite
    });

  } catch (error) {
    console.error("BACKEND: An error occurred while fetching the Instagram profile:", error);
    res.status(500).json({ message: error.message || 'An internal server error occurred.' });
  }
};