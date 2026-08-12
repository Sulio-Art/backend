import asyncHandler from "express-async-handler";
import DeletionRequest from "../model/deletionRequest.Model.js";
import { parseSignedRequest } from "../utils/metaSignedRequest.js";
import {
  disconnectInstagram,
  findUserByMetaId,
  runDeletionRequest,
} from "../services/accountDeletion.Service.js";

/**
 * Meta's Deauthorize and Data Deletion Request callbacks, plus the public status
 * endpoint the latter requires. See META-COMPLIANCE-PLAN.md 1.4.
 *
 * These are unauthenticated endpoints — Meta calls them server-to-server with no
 * bearer token — so `signed_request` HMAC verification is the entire access
 * control. Anything that fails verification is logged and rejected; we do not
 * fall back to trusting the body.
 */

const APP_SECRET = () => process.env.INSTAGRAM_APP_SECRET;

const appUrl = () =>
  (process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || "").replace(
    /\/+$/,
    "",
  );

const verify = (req) => {
  const signedRequest = req.body?.signed_request;

  if (!signedRequest) {
    const error = new Error("Missing signed_request.");
    error.statusCode = 400;
    throw error;
  }

  return parseSignedRequest(signedRequest, APP_SECRET());
};

/**
 * POST /api/meta/deauthorize
 *
 * Fired when a user removes the app from their Instagram/Facebook settings. They
 * have revoked our access, not asked us to delete their Sulio account — so this
 * unlinks and destroys the Instagram-derived credentials rather than cascading.
 */
export const handleDeauthorize = asyncHandler(async (req, res) => {
  let payload;
  try {
    payload = verify(req);
  } catch (error) {
    console.error("[META-DEAUTHORIZE] Rejected:", error.message);
    return res.status(400).json({ error: "Invalid signed_request." });
  }

  const metaUserId = payload.user_id;
  const user = await findUserByMetaId(metaUserId);

  if (!user) {
    // Nothing to do, but answer 200: Meta retries on failure, and an unknown id
    // is a legitimate outcome (already deleted, or never registered).
    console.log("[META-DEAUTHORIZE] No local user for the supplied id.");
    return res.status(200).json({ ok: true });
  }

  await disconnectInstagram(user);

  await DeletionRequest.create({
    confirmationCode: `deauth-${user._id}-${Date.now()}`,
    source: "meta-deauthorize",
    userId: user._id,
    asid: String(metaUserId),
    status: "completed",
    deleted: { instagramConnection: 1 },
    completedAt: new Date(),
  });

  console.log(`[META-DEAUTHORIZE] Unlinked Instagram for user ${user._id}.`);
  return res.status(200).json({ ok: true });
});

/**
 * POST /api/meta/data-deletion
 *
 * Meta requires this to respond with a status URL and a confirmation code, in
 * exactly this shape, so the user can check the outcome later.
 */
export const handleDataDeletion = asyncHandler(async (req, res) => {
  let payload;
  try {
    payload = verify(req);
  } catch (error) {
    console.error("[META-DATA-DELETION] Rejected:", error.message);
    return res.status(400).json({ error: "Invalid signed_request." });
  }

  const metaUserId = payload.user_id;
  const user = await findUserByMetaId(metaUserId);

  const { confirmationCode } = await runDeletionRequest({
    source: "meta-data-deletion",
    userId: user?._id || null,
    asid: String(metaUserId),
    instagramUserId: user?.instagramUserId || null,
    email: user?.email || null,
  });

  console.log(
    `[META-DATA-DELETION] Processed request ${confirmationCode} (user found: ${Boolean(
      user,
    )}).`,
  );

  return res.status(200).json({
    url: `${appUrl()}/data-deletion-status/${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
});

/**
 * GET /api/meta/data-deletion/:code
 *
 * Public status lookup backing the URL above. Deliberately returns no personal
 * data — only whether the request completed — because the code is bearer-like and
 * may be pasted anywhere.
 */
export const getDeletionStatus = asyncHandler(async (req, res) => {
  const request = await DeletionRequest.findOne({
    confirmationCode: req.params.code,
  }).select("status createdAt completedAt outstanding source");

  if (!request) {
    return res.status(404).json({ message: "Unknown confirmation code." });
  }

  return res.status(200).json({
    confirmationCode: req.params.code,
    status: request.status,
    requestedAt: request.createdAt,
    completedAt: request.completedAt,
    // Surfaced so the page can be honest when something is still outstanding.
    pendingItems: request.outstanding || [],
  });
});
