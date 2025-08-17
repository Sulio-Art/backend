import User from '../model/user.model.js';
import Subscription from '../model/subscription.Model.js';
import mongoose from 'mongoose';

/**
 * Maps the status from the Subscription model to the corresponding enum in the User model.
 * This ensures consistency between the two models.
 * @param {string} subscriptionStatus - The status from the Subscription document.
 * @returns {string} - The corresponding status for the User document.
 */
const mapSubscriptionStatusToUserStatus = (subscriptionStatus) => {
    // User model enums: ['free_trial', 'active', 'inactive', 'cancelled', 'trial_expired']
    // Subscription model enums: ['active', 'expired', 'cancelled', 'pending', 'trial']
    const statusMap = {
        active: 'active',
        expired: 'trial_expired', // Correctly maps 'expired' (post-trial) to 'trial_expired'
        trial: 'free_trial',
        cancelled: 'cancelled',
        pending: 'inactive', // Mapping pending to inactive
    };
    return statusMap[subscriptionStatus] || 'inactive'; // Default to a safe status
};

/**
 * Ensures a user's subscription state is checked, updated if necessary (e.g., trial expired),
 * and synced with their User document. This is the authoritative synchronization service.
 * @param {string} userId - The ID of the user to sync.
 * @returns {Promise<{user: object, subscription: object}>} - The synced user and subscription documents.
 */
export const syncUserWithSubscription = async (userId) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error("Invalid user ID provided to sync service.");
    }

    let user = await User.findById(userId).select('-password');
    if (!user) {
        throw new Error("User not found for synchronization.");
    }

    let subscription = await Subscription.findOne({ userId });

    // 1. Handle case where user has no subscription record
    if (!subscription) {
        console.log(`[Sync Service] No subscription found for user ${userId}. Creating default free plan.`);
        subscription = await Subscription.create({
            userId: user._id, plan: "free", status: "active", amount: 0,
            billingCycle: "monthly", startDate: new Date(), endDate: null,
        });
        user = await User.findByIdAndUpdate(user._id, {
            subscriptionId: subscription._id, currentPlan: "free", subscriptionStatus: "active",
        }, { new: true }).select('-password');
        return { user, subscription };
    }

    // 2. Authoritatively handle trial expiration
    if (subscription.status === "trial" && subscription.endDate && new Date() > new Date(subscription.endDate)) {
        console.log(`[Sync Service] Trial expired for user ${userId} at ${new Date(subscription.endDate).toISOString()}. Plan: ${subscription.plan} -> free.`);
        subscription.plan = "free";
        subscription.status = "expired";
        await subscription.save();
    }

    // 3. Check for inconsistencies and perform an atomic update if needed
    const expectedUserStatus = mapSubscriptionStatusToUserStatus(subscription.status);
    const needsUserUpdate = user.currentPlan !== subscription.plan || user.subscriptionStatus !== expectedUserStatus;

    if (needsUserUpdate) {
        console.log(`[Sync Service] Syncing user ${userId}. Plan: '${user.currentPlan}'->'${subscription.plan}'. Status: '${user.subscriptionStatus}'->'${expectedUserStatus}'.`);
        try {
            // Use findByIdAndUpdate for an atomic operation to prevent race conditions
            const updatedUser = await User.findByIdAndUpdate(user._id, {
                currentPlan: subscription.plan,
                subscriptionStatus: expectedUserStatus,
            }, { new: true, runValidators: true }).select('-password');
            user = updatedUser; // Use the freshly updated user object
            console.log(`[Sync Service] User ${user._id} document updated successfully.`);
        } catch (syncError) {
            console.error(`[Sync Service] Atomic update failed for user ${userId}:`, syncError.message);
            // The request proceeds with the initially fetched user data, preventing a crash.
        }
    }

    return { user, subscription };
};