import Profile from "../model/profile.Model.js";

export const updateChatbotSettingsForUser = async (userId, settingsToUpdate) => {
  if (!userId || !settingsToUpdate || typeof settingsToUpdate !== 'object') {
    throw new Error("Invalid arguments provided to updateChatbotSettingsForUser");
  }


  const profile = await Profile.findOneAndUpdate(
    { userId },
    { $set: { userId } }, 
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  Object.keys(settingsToUpdate).forEach(key => {
    profile.chatbotSettings.set(key, settingsToUpdate[key]);
  });
  
  profile.isChatbotConfigured = true;

  await profile.save();
  
  return Object.fromEntries(profile.chatbotSettings);
};