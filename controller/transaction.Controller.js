import paypal from '@paypal/checkout-server-sdk';
import Transaction from "../model/transaction.Model.js";
import mongoose from "mongoose";
import asyncHandler from "express-async-handler";

const environment = new paypal.core.SandboxEnvironment(
  process.env.PAYPAL_CLIENT_ID,
  process.env.PAYPAL_CLIENT_SECRET
);
const client = new paypal.core.PayPalHttpClient(environment);

const createPayPalOrder = asyncHandler(async (req, res) => {
  const { amount, currency } = req.body;
  if (!amount || !currency) {
    return res
      .status(400)
      .json({ message: "Amount and currency are required" });
  }

  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer("return=representation");
  request.requestBody({
    intent: "CAPTURE",
    purchase_units: [
      { amount: { currency_code: currency, value: amount.toString() } },
    ],
  });

  const order = await client.execute(request);

  await Transaction.create({
    userId: req.user.id,
    amount,
    currency,
    provider: "paypal",
    paypalOrderId: order.result.id,
    status: "pending",
  });

  res.status(201).json({ orderId: order.result.id });
});

const capturePayPalPayment = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  const request = new paypal.orders.OrdersCaptureRequest(orderId);
  request.requestBody({});

  const capture = await client.execute(request);

  await Transaction.findOneAndUpdate(
    { paypalOrderId: orderId },
    {
      status: "completed",
      details: capture.result,
      transactionDate: new Date(),
    }
  );

  res.status(200).json({ success: true, details: capture.result });
});

const getMyTransactions = asyncHandler(async (req, res) => {
  const userPlan = req.user.currentPlan || "free";
  if (userPlan === "free" || userPlan === "trial_expired") {
    return res.status(403).json({
      message:
        "Access denied. Please upgrade your plan to view transaction history.",
    });
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const { search, status } = req.query;
  const query = { userId: req.user.id };

  if (search) {
    query.$or = [
      { paypalOrderId: { $regex: search, $options: "i" } },
      { status: { $regex: search, $options: "i" } },
    ];
  }

  if (status) {
    query.status = status;
  }

  const total = await Transaction.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  const transactions = await Transaction.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({ transactions, currentPage: page, totalPages });
});

const getTransactionById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Transaction ID" });
  }
  const transaction = await Transaction.findById(id);

  if (!transaction || transaction.userId.toString() !== req.user.id) {
    return res.status(404).json({ message: "Transaction not found" });
  }

  res.status(200).json(transaction);
});

const getAllTransactions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 15;
  const skip = (page - 1) * limit;

  const total = await Transaction.countDocuments({});
  const totalPages = Math.ceil(total / limit);

  const transactions = await Transaction.find({})
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({ transactions, currentPage: page, totalPages });
});

export {
  createPayPalOrder,
  capturePayPalPayment,
  getMyTransactions,
  getTransactionById,
  getAllTransactions,
};