

import User from "../model/user.model.js";


export const createCustomer = async (req, res) => {
  try {
   
    const customer = await User.create(req.body);
    res.status(201).json(customer);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


export const getCustomers = async (req, res) => {
  try {
   
    const customers = await User.find({ role: "user" });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
