import express from "express";
import {
  createCustomer,
  getCustomers,
} from "../controller/customer.Controller.js";
import { protect, admin } from "../middleware/auth.middleware.js";
const router = express.Router();

router.route("/").post(createCustomer).get(protect, admin, getCustomers);

export default router;
