import User from "../model/user.model.js";
import Subscription from "../model/subscription.Model.js";
import Transaction from "../model/transaction.Model.js";

/**
 * Activates or updates a user's subscription plan after a successful payment.
 * This is the single source of truth for upgrading a user's plan.
 * @param {object} details - The payment details from the verification step.
 * @param {string} details.userId - The ID of the user.
 * @param {string} details.razorpayPaymentId - The Razorpay payment ID.
 * @param {string} details.razorpayOrderId - The Razorpay order ID.
 * @param {string} details.razorpaySignature - The Razorpay signature.
 * @returns {Promise<{subscription: object}>} - The newly activated subscription document.
 */
export const activateNewSubscription = async ({
  userId,
  razorpayPaymentId,
  razorpayOrderId,
  razorpaySignature,
}) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found for subscription activation.");

  // Find the original transaction to get the plan, billing cycle, and amount
  const pendingTransaction = await Transaction.findOne({ razorpayOrderId, userId });
  if (!pendingTransaction) throw new Error(`Pending transaction with orderId ${razorpayOrderId} not found.`);
  if (pendingTransaction.status !== 'pending') throw new Error(`Transaction is not in a pending state.`);

  const { plan, billingCycle, amount } = pendingTransaction;

  // Calculate the end date
  const startDate = new Date();
  let endDate = new Date(startDate);
  if (billingCycle === "yearly") {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }

  // 1. Atomically update or create the Subscription
  const subscription = await Subscription.findOneAndUpdate(
    { userId },
    {
      plan, status: "active", amount, billingCycle, provider: "razorpay",
      razorpayPaymentId, razorpayOrderId, razorpaySignature,
      startDate, endDate,
    },
    { upsert: true, new: true, runValidators: true }
  );

  // 2. Atomically update the User document to sync state
  await User.findByIdAndUpdate(userId, {
      currentPlan: subscription.plan,
      subscriptionStatus: "active",
      subscriptionId: subscription._id,
  }, { new: true, runValidators: true });

  // 3. Update the Transaction from 'pending' to 'completed'
  pendingTransaction.status = "completed";
  pendingTransaction.razorpayPaymentId = razorpayPaymentId;
  pendingTransaction.transactionDate = new Date();
  await pendingTransaction.save();

  console.log(`[Subscription Service] Successfully activated '${plan}' plan for user ${userId}.`);
  return { subscription };
};