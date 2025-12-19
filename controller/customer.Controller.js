import asyncHandler from "express-async-handler";
import Customer from "../model/customer.model.js";
import User from "../model/user.model.js";

export const getCustomers = asyncHandler(async (req, res) => {
  try {
    // 1. Check if User ID exists from middleware
    if (!req.user || !req.user.id) {
      console.error("[ERROR] No user ID in request");
      return res
        .status(401)
        .json({ message: "Authentication failed: No User ID found" });
    }

    const userId = req.user.id;
    console.log(`[DEBUG] Fetching customers for user: ${userId}`);

    // 2. Fetch User to get Instagram ID
    const user = await User.findById(userId).select("instagramUserId");

    if (!user) {
      console.log("[DEBUG] User not found in database");
      return res.status(200).json([]);
    }

    if (!user.instagramUserId) {
      console.log("[DEBUG] User has no instagramUserId linked");
      return res.status(200).json([]);
    }

    const artistInstagramId = user.instagramUserId;
    console.log(`[DEBUG] Artist Instagram ID: ${artistInstagramId}`);

    // 3. Fetch Customers with error handling
    const customers = await Customer.find({
      recipient_id: artistInstagramId,
    })
      .sort({ last_contacted: -1 })
      .select("-__v")
      .lean() // Add lean() for better performance
      .exec();

    console.log(`[DEBUG] Successfully found ${customers.length} customers`);

    // Return customers even if empty array
    res.status(200).json(customers);
  } catch (error) {
    // Log the full error stack
    console.error("🔥 ERROR in getCustomers:");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);

    // Return proper error response
    res.status(500).json({
      message: "Server Error fetching customers",
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

export const getCustomerById = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const customerId = req.params.id;

    console.log(`[DEBUG] Fetching customer ${customerId} for user ${userId}`);

    // Validate customerId format
    if (!customerId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid customer ID format" });
    }

    const user = await User.findById(userId).select("instagramUserId");

    if (!user || !user.instagramUserId) {
      return res.status(404).json({ message: "Instagram not connected" });
    }

    const customer = await Customer.findOne({
      _id: customerId,
      recipient_id: user.instagramUserId,
    }).lean();

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.status(200).json(customer);
  } catch (error) {
    console.error("🔥 ERROR in getCustomerById:");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);

    res.status(500).json({
      message: "Server Error fetching customer",
      error: error.message,
    });
  }
});
