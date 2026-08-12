import express from "express";
import {
  handleDeauthorize,
  handleDataDeletion,
  getDeletionStatus,
} from "../controller/meta.controller.js";

const router = express.Router();

/**
 * Meta posts these callbacks as `application/x-www-form-urlencoded` with a single
 * `signed_request` field, so they need their own parser — the app-wide
 * `express.json()` would leave `req.body` empty and every callback would be
 * rejected as unsigned.
 */
const metaBodyParser = express.urlencoded({ extended: false });

router.post("/deauthorize", metaBodyParser, handleDeauthorize);
router.post("/data-deletion", metaBodyParser, handleDataDeletion);
router.get("/data-deletion/:code", getDeletionStatus);

export default router;
