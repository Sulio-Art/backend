import Profile from "../model/profile.Model.js";

/**
 * Finds a user's profile and updates their chatbot settings map.
 * This service is designed to be called from other controllers (like chatController)
 * to keep the business logic for profile modification centralized and reusable.
 *
 * @param {string} userId - The ID of the user whose profile to update.
 * @param {object} settingsToUpdate - An object containing the chatbot settings to update.
 * @returns {Promise<object>} The updated chatbot settings as a plain object.
 */
export const updateChatbotSettingsForUser = async (userId, settingsToUpdate) => {
  // Validate the input to ensure data integrity
  if (!userId || !settingsToUpdate || typeof settingsToUpdate !== 'object') {
    // Throw an error that can be caught by the controller's try-catch block
    throw new Error("Invalid arguments provided to updateChatbotSettingsForUser");
  }

  // Use findOneAndUpdate with the 'upsert' option. This is robust because it will
  // find and update the profile OR create it if one doesn't exist for the user yet.
  const profile = await Profile.findOneAndUpdate(
    { userId },
    { $set: { userId } }, // This ensures the userId is set if a new document is created
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  // Iterate over the keys in the provided settings object and update the Map in the Mongoose model
  Object.keys(settingsToUpdate).forEach(key => {
    profile.chatbotSettings.set(key, settingsToUpdate[key]);
  });
  
  // Mark the chatbot as configured, which might be useful for UI logic
  profile.isChatbotConfigured = true;

  // Save the changes to the database
  await profile.save();
  
  // Return the updated settings as a simple JavaScript object for the controller to send in the response
  return Object.fromEntries(profile.chatbotSettings);
};