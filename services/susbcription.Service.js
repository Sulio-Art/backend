import User from "../model/user.model.js";
import Subscription from "../model/subscription.Model.js";
import Transaction from "../model/transaction.Model.js";


export const activateNewSubscription = async ({
  userId,
  razorpayPaymentId,
  razorpayOrderId,
  razorpaySignature,
}) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found for subscription activation.");

  const pendingTransaction = await Transaction.findOne({ razorpayOrderId, userId });
  if (!pendingTransaction) throw new Error(`Pending transaction with orderId ${razorpayOrderId} not found.`);
  if (pendingTransaction.status !== 'pending') throw new Error(`Transaction is not in a pending state.`);

  const { plan, billingCycle, amount } = pendingTransaction;


  const startDate = new Date();
  let endDate = new Date(startDate);
  if (billingCycle === "yearly") {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }


  const subscription = await Subscription.findOneAndUpdate(
    { userId },
    {
      plan, status: "active", amount, billingCycle, provider: "razorpay",
      razorpayPaymentId, razorpayOrderId, razorpaySignature,
      startDate, endDate,
    },
    { upsert: true, new: true, runValidators: true }
  );


  await User.findByIdAndUpdate(userId, {
      currentPlan: subscription.plan,
      subscriptionStatus: "active",
      subscriptionId: subscription._id,
  }, { new: true, runValidators: true });


  pendingTransaction.status = "completed";
  pendingTransaction.razorpayPaymentId = razorpayPaymentId;
  pendingTransaction.transactionDate = new Date();
  await pendingTransaction.save();

  console.log(`[Subscription Service] Successfully activated '${plan}' plan for user ${userId}.`);
  return { subscription };
};