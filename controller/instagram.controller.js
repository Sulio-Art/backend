import fetch from 'node-fetch';
import User from '../model/user.model.js';

/**
 * @desc    Connects a user's Instagram account after they complete the OAuth flow.
 * @route   POST /api/auth/instagram/connect
 * @access  Private
 *
 * This function performs the complete OAuth 2.0 code exchange flow:
 * 1. Exchanges the received authorization code for a short-lived access token and the user's Instagram ID.
 * 2. Exchanges the short-lived token for a long-lived token (valid for 60 days).
 * 3. Fetches the user's Instagram profile data using the long-lived token.
 * 4. Saves all tokens, expiration dates, and profile data to the database.
 */
export const connectInstagramAccount = async (req, res) => {
  const { code } = req.body;
  const loggedInUserId = req.user.id; // From 'protect' middleware

  if (!code) {
    return res.status(400).json({ message: 'Authorization code is required.' });
  }

  try {
    // --- Step 1: Exchange Code for Short-Lived Token & User ID ---
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
    if (tokenData.error_message || tokenData.error) {
      throw new Error(tokenData.error_message || tokenData.error.message || 'Failed to exchange code for token.');
    }

    // *** CRITICAL FIX: Capture both user_id and token from THIS response ***
    const shortLivedAccessToken = tokenData.access_token;
    const instagramUserId = tokenData.user_id; // <-- The ID is only available here.

    if (!shortLivedAccessToken || !instagramUserId) {
        throw new Error('Could not retrieve access token or user ID from Instagram.');
    }

    // --- Step 2: Exchange for a Long-Lived Token ---
    const longLivedTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.INSTAGRAM_APP_SECRET}&access_token=${shortLivedAccessToken}`;
    const longLivedTokenResponse = await fetch(longLivedTokenUrl);
    const longLivedTokenData = await longLivedTokenResponse.json();
    if (longLivedTokenData.error) {
      throw new Error(longLivedTokenData.error.message);
    }
    
    const longLivedAccessToken = longLivedTokenData.access_token;
    const expiresIn = longLivedTokenData.expires_in;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    
    // --- Step 3: Fetch Profile Data using the valid User ID and Long-Lived Token ---
    const fields = 'id,username,followers_count,biography,profile_picture_url,website';
    const profileApiUrl = `https://graph.instagram.com/${instagramUserId}?fields=${fields}&access_token=${longLivedAccessToken}`;
    const profileResponse = await fetch(profileApiUrl);
    const profileData = await profileResponse.json();
    if (profileData.error) {
      throw new Error(profileData.error.message);
    }

    // --- Step 4: Atomically Save Everything to the Database ---
    await User.findByIdAndUpdate(loggedInUserId, {
      instagramUserId: instagramUserId, // Correctly saved
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
    console.error("BACKEND ERROR [connectInstagramAccount]:", error);
    res.status(500).json({ message: error.message || 'An internal server error occurred.' });
  }
};


/**
 * @desc    Gets the connected Instagram profile data from the local database.
 *          Includes logic to refresh profile data from the API.
 *          Includes logic to automatically refresh the access token if it's nearing expiration.
 * @route   GET /api/auth/instagram/profile
 * @access  Private
 */
export const getInstagramProfile = async (req, res) => {
  const loggedInUserId = req.user.id;
  const shouldRefreshData = req.query.refresh === 'true'; // For explicitly refreshing profile data

  try {
    let user = await User.findById(loggedInUserId);

    if (!user || !user.instagramUserId || !user.instagramAccessToken) {
      return res.status(404).json({ message: 'This account has not been connected to Instagram.' });
    }

    // --- SIGNIFICANT IMPROVEMENT: Automatic Token Refresh Logic ---
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // If token is expired or expires within 7 days, attempt to refresh it.
    if (new Date() > user.instagramTokenExpiresAt) {
      return res.status(401).json({ message: 'The Instagram token has expired. Please reconnect the account.' });
    }
    
    if (user.instagramTokenExpiresAt < sevenDaysFromNow) {
      console.log(`[Instagram Token Refresh]: Token for user ${user.username} is nearing expiration. Attempting refresh.`);
      try {
        const refreshTokenUrl = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${user.instagramAccessToken}`;
        const refreshResponse = await fetch(refreshTokenUrl);
        const refreshData = await refreshResponse.json();

        if (refreshData.error) {
          throw new Error(refreshData.error.message);
        }

        // Update the user's token and expiration in the database
        user.instagramAccessToken = refreshData.access_token;
        user.instagramTokenExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000);
        await user.save();
        console.log(`[Instagram Token Refresh]: Token for user ${user.username} successfully refreshed.`);

      } catch (refreshError) {
        console.error(`[Instagram Token Refresh]: FAILED to refresh token for user ${user.username}. They may need to reconnect. Error: ${refreshError.message}`);
        // Do not block the request if refresh fails; proceed with the old token.
        // The client can be notified of the potential issue.
      }
    }
    
    // If a manual data refresh is requested, fetch from API and update the DB
    if (shouldRefreshData) {
      const fields = 'id,username,followers_count,biography,profile_picture_url,website';
      const apiUrl = `https://graph.instagram.com/${user.instagramUserId}?fields=${fields}&access_token=${user.instagramAccessToken}`;

      const response = await fetch(apiUrl);
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      // Update user in DB with the fresh data and return the updated document
      user = await User.findByIdAndUpdate(loggedInUserId, {
        instagramUsername: data.username,
        instagramProfilePictureUrl: data.profile_picture_url,
        instagramFollowersCount: data.followers_count,
        instagramBio: data.biography,
        instagramWebsite: data.website
      }, { new: true }); // {new: true} returns the updated document
    }

    // Respond with the (potentially updated) data from our database
    res.status(200).json({
      id: user.instagramUserId,
      username: user.instagramUsername,
      profile_picture_url: user.instagramProfilePictureUrl,
      followers_count: user.instagramFollowersCount,
      biography: user.instagramBio,
      website: user.instagramWebsite
    });

  } catch (error) {
    console.error("BACKEND ERROR [getInstagramProfile]:", error);
    res.status(500).json({ message: error.message || 'An internal server error occurred.' });
  }
};
