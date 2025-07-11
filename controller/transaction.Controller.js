import paypal from '@paypal/checkout-server-sdk';
import Transaction from '../models/transaction.model.js';
import mongoose from 'mongoose';

const environment = new paypal.core.SandboxEnvironment(
  process.env.PAYPAL_CLIENT_ID,
  process.env.PAYPAL_CLIENT_SECRET
);
const client = new paypal.core.PayPalHttpClient(environment);

const createPayPalOrder = async (req, res) => {
  const { amount, currency } = req.body;
  if (!amount || !currency) {
    return res.status(400).json({ message: 'Amount and currency are required' });
  }

  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer('return=representation');
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [{ amount: { currency_code: currency, value: amount.toString() } }],
  });

  try {
    const order = await client.execute(request);

    await Transaction.create({
      userId: req.user.id,
      amount,
      currency,
      provider: 'paypal',
      paypalOrderId: order.result.id,
      status: 'pending',
    });

    res.status(201).json({ orderId: order.result.id });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const capturePayPalPayment = async (req, res) => {
  const { orderId } = req.body;
  const request = new paypal.orders.OrdersCaptureRequest(orderId);
  request.requestBody({});

  try {
    const capture = await client.execute(request);
    
    await Transaction.findOneAndUpdate(
      { paypalOrderId: orderId },
      {
        status: 'completed',
        details: capture.result,
        transactionDate: new Date(),
      }
    );

    res.status(200).json({ success: true, details: capture.result });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const getMyTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid Transaction ID' });
    }
    const transaction = await Transaction.findById(id);

    if (!transaction || transaction.userId.toString() !== req.user.id) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    res.status(200).json(transaction);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

const getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({}).populate('userId', 'name email').sort({ createdAt: -1 });
    res.status(200).json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

export {
  createPayPalOrder,
  capturePayPalPayment,
  getMyTransactions,
  getTransactionById,
  getAllTransactions,
};