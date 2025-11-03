import Profile from "../model/profile.Model.js";

export const updateChatbotSettingsForUser = async (
  userId,
  settingsToUpdate
) => {
  // --- BACKEND LOG 6 ---
  console.log(
    "[BACKEND-SERVICE-DEBUG] 6. updateChatbotSettingsForUser service called."
  );

  if (!userId || !settingsToUpdate || typeof settingsToUpdate !== "object") {
    throw new Error("Invalid arguments provided for chatbot settings update");
  }

  const updateQuery = {
    $set: {
      isChatbotConfigured: true,
    },
  };

  for (const key in settingsToUpdate) {
    if (Object.prototype.hasOwnProperty.call(settingsToUpdate, key)) {
      updateQuery.$set[`chatbotSettings.${key}`] = settingsToUpdate[key];
    }
  }

  // --- BACKEND LOG 7 ---
  console.log(
    "[BACKEND-SERVICE-DEBUG] 7. Constructed the following update query for MongoDB:",
    JSON.stringify(updateQuery, null, 2)
  );

  try {
    // --- BACKEND LOG 8 ---
    console.log(
      "[BACKEND-SERVICE-DEBUG] 8. Executing findOneAndUpdate command... (If it hangs, you won't see log 9)"
    );
    const updatedProfile = await Profile.findOneAndUpdate(
      { userId: userId },
      updateQuery,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // --- BACKEND LOG 9 ---
    console.log(
      "[BACKEND-SERVICE-DEBUG] 9. findOneAndUpdate command COMPLETED."
    );

    if (!updatedProfile) {
      console.error(
        "[BACKEND-SERVICE-DEBUG] CRITICAL FAILURE: findOneAndUpdate returned null."
      );
      throw new Error(
        `Profile not found for user ${userId} and could not be created.`
      );
    }

    return Object.fromEntries(updatedProfile.chatbotSettings);
  } catch (error) {
    console.error(
      "[BACKEND-SERVICE-DEBUG] FATAL ERROR during database operation:",
      error
    );
    throw error; // Re-throw the error to be caught by the controller
  }
};
