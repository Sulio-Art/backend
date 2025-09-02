import User from '../model/user.model.js';
import Subscription from '../model/subscription.Model.js';
import mongoose from 'mongoose';

const mapSubscriptionStatusToUserStatus = (subscriptionStatus) => {
   
    const statusMap = {
        active: 'active',
        expired: 'trial_expired',
        trial: 'free_trial',
        cancelled: 'cancelled',
        pending: 'inactive',
    };
    return statusMap[subscriptionStatus] || 'inactive';
};


export const syncUserWithSubscription = async (userId) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error("Invalid user ID provided to sync service.");
    }

    let user = await User.findById(userId).select('-password');
    if (!user) {
        throw new Error("User not found for synchronization.");
    }

    let subscription = await Subscription.findOne({ userId });

    
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


    if (subscription.status === "trial" && subscription.endDate && new Date() > new Date(subscription.endDate)) {
        console.log(`[Sync Service] Trial expired for user ${userId} at ${new Date(subscription.endDate).toISOString()}. Plan: ${subscription.plan} -> free.`);
        subscription.plan = "free";
        subscription.status = "expired";
        await subscription.save();
    }


    const expectedUserStatus = mapSubscriptionStatusToUserStatus(subscription.status);
    const needsUserUpdate = user.currentPlan !== subscription.plan || user.subscriptionStatus !== expectedUserStatus;

    if (needsUserUpdate) {
        console.log(`[Sync Service] Syncing user ${userId}. Plan: '${user.currentPlan}'->'${subscription.plan}'. Status: '${user.subscriptionStatus}'->'${expectedUserStatus}'.`);
        try {
          
            const updatedUser = await User.findByIdAndUpdate(user._id, {
                currentPlan: subscription.plan,
                subscriptionStatus: expectedUserStatus,
            }, { new: true, runValidators: true }).select('-password');
            user = updatedUser;
            console.log(`[Sync Service] User ${user._id} document updated successfully.`);
        } catch (syncError) {
            console.error(`[Sync Service] Atomic update failed for user ${userId}:`, syncError.message);
           
        }
    }

    return { user, subscription };
};