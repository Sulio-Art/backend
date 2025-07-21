// backend/controllers/customer.Controller.js

import User from "../model/user.model.js"; // CORRECTED IMPORT

// This function creates a user, which is what your old `createCustomer` was likely doing.
// This might be redundant if you already have a `register` function.
export const createCustomer = async (req, res) => {
  try {
    // You would use the User model to create a new user/customer
    const customer = await User.create(req.body);
    res.status(201).json(customer);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// This function gets all users/customers
export const getCustomers = async (req, res) => {
  try {
    // Use the User model to find all users
    const customers = await User.find({ role: "user" }); // You can filter for role='user'
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
