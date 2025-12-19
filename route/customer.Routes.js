import express from "express";
import {
  getCustomers,
  getCustomerById, // This must match the export in the controller
} from "../controller/customer.Controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.route("/").get(protect, getCustomers);
router.route("/:id").get(protect, getCustomerById);

export default router;
