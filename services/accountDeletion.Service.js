import crypto from "crypto";
import mongoose from "mongoose";
import User from "../model/user.model.js";
import Otp from "../model/otp.model.js";
import Chat from "../model/chat.Model.js";
import ChatLog from "../model/chatLog.Model.js";
import TestChat from "../model/testChat.Model.js";
import DiaryEntry from "../model/diaryEntry.Model.js";
import Profile from "../model/profile.Model.js";
import Artwork from "../model/artWork.Model.js";
import Event from "../model/eventManagment.Model.js";
import Transaction from "../model/transaction.Model.js";
import Subscription from "../model/subscription.Model.js";
import DeletionRequest from "../model/deletionRequest.Model.js";
import PendingInstagramRegistration from "../model/pendingInstagramRegistration.Model.js";
import OAuthState from "../model/oauthState.Model.js";
import cloudinary from "../middleware/cloudinery.middleware.js";

/**
 * The single deletion cascade, shared by all three doors: Meta's Data Deletion
 * Request callback, Meta's Deauthorize callback, and a user deleting their own
 * account. See META-COMPLIANCE-PLAN.md 1.4.
 *
 * Two decisions worth knowing before changing anything here:
 *
 *   Transactions are anonymized, not deleted. The privacy policy claims a 5–7
 *   year retention for transaction records on legal grounds, so destroying them
 *   would contradict a published commitment. The PII and the raw provider payload
 *   go; the amount, date and provider reference stay.
 *
 *   `Customer` / `users_backend1` is NOT touched. An external Python service owns
 *   that collection, and it holds the artist's own customers' personal data. It
 *   is recorded in `outstanding` instead of being silently skipped — reporting a
 *   deletion complete while rows survive is worse than an open item.
 */

const CUSTOMER_COLLECTION_NOTE =
  "Customer/users_backend1 — externally owned by the Python service; requires a delete hook there";

export const generateConfirmationCode = () =>
  crypto.randomBytes(16).toString("hex");

/**
 * Cloudinary public ids for a delivery URL.
 *
 * Diary entries store `public_id` alongside the URL and are handled directly.
 * Artwork and profile images only ever stored the URL, so the id has to be
 * recovered from it: everything after `/upload/` (minus a version segment and the
 * file extension) is the public id. Transformation segments would break this, and
 * none of the current upload paths add any — if that changes, store the id.
 */
export const publicIdFromUrl = (url) => {
  if (typeof url !== "string" || !url.includes("/upload/")) return null;

  const afterUpload = url.split("/upload/")[1];
  if (!afterUpload) return null;

  const withoutVersion = afterUpload.replace(/^v\d+\//, "");
  const withoutQuery = withoutVersion.split("?")[0];
  const withoutExtension = withoutQuery.replace(/\.[a-zA-Z0-9]+$/, "");

  return withoutExtension || null;
};

const deleteCloudinaryAssets = async (publicIds, report) => {
  const ids = [...new Set(publicIds.filter(Boolean))];
  if (ids.length === 0) return;

  try {
    // delete_resources caps at 100 ids per call.
    for (let index = 0; index < ids.length; index += 100) {
      await cloudinary.api.delete_resources(ids.slice(index, index + 100));
    }
    report.cloudinaryAssets = (report.cloudinaryAssets || 0) + ids.length;
  } catch (error) {
    // A Cloudinary failure must not abort the database cascade — the account data
    // is the more sensitive half. Record it so it can be retried.
    report.cloudinaryError = error.message;
  }
};

/**
 * Collect every Cloudinary asset belonging to a user before their documents go.
 */
const collectAssets = async (userId) => {
  const [diaryEntries, artworks, profile] = await Promise.all([
    DiaryEntry.find({ userId }).select("artworkPhotos").lean(),
    Artwork.find({ userId }).select("imageUrls").lean(),
    Profile.findOne({ userId }).select("profilePicture coverPhoto").lean(),
  ]);

  const ids = [];

  for (const entry of diaryEntries || []) {
    for (const photo of entry.artworkPhotos || []) {
      if (photo?.public_id) ids.push(photo.public_id);
    }
  }

  for (const artwork of artworks || []) {
    for (const url of artwork.imageUrls || []) {
      ids.push(publicIdFromUrl(url));
    }
  }

  if (profile) {
    ids.push(publicIdFromUrl(profile.profilePicture));
    ids.push(publicIdFromUrl(profile.coverPhoto));
  }

  return ids;
};

/**
 * Strip personal data from transactions while leaving the financial record.
 */
const anonymizeTransactions = async (userId, report) => {
  const result = await Transaction.updateMany(
    { userId },
    {
      $set: {
        details: {},
        anonymizedAt: new Date(),
      },
    },
    // The user document is gone, so validators referencing it would fail.
    { strict: false, runValidators: false },
  );

  report.transactionsAnonymized = result.modifiedCount ?? 0;
};

/**
 * Delete everything belonging to one user.
 */
export const deleteUserData = async ({ userId }) => {
  const report = {};
  const outstanding = [];

  const assetIds = userId ? await collectAssets(userId) : [];

  if (userId) {
    const user = await User.findById(userId).select("email").lean();

    const [
      chats,
      chatLogs,
      testChats,
      diary,
      profiles,
      artworks,
      events,
      subscriptions,
      states,
    ] = await Promise.all([
      Chat.deleteMany({ userId }),
      ChatLog.deleteMany({ userId }),
      TestChat.deleteMany({ userId }),
      DiaryEntry.deleteMany({ userId }),
      Profile.deleteMany({ userId }),
      Artwork.deleteMany({ userId }),
      Event.deleteMany({ userId }),
      Subscription.deleteMany({ userId }),
      OAuthState.deleteMany({ userId }),
    ]);

    report.chats = chats.deletedCount ?? 0;
    report.chatLogs = chatLogs.deletedCount ?? 0;
    report.testChats = testChats.deletedCount ?? 0;
    report.diaryEntries = diary.deletedCount ?? 0;
    report.profiles = profiles.deletedCount ?? 0;
    report.artworks = artworks.deletedCount ?? 0;
    report.events = events.deletedCount ?? 0;
    report.subscriptions = subscriptions.deletedCount ?? 0;
    report.oauthStates = states.deletedCount ?? 0;

    await anonymizeTransactions(userId, report);

    if (user?.email) {
      const otps = await Otp.deleteMany({ email: user.email });
      report.otps = otps.deletedCount ?? 0;
    }

    const users = await User.deleteOne({ _id: userId });
    report.users = users.deletedCount ?? 0;
  }

  /**
   * No sweep by `igid`. Every Chat document is written with a `userId` alongside
   * it (chat.Controller.js:132-139), so deleting by user is already complete —
   * and `Chat.igid` is randomly encrypted with no blind index, so a filter on it
   * would match nothing and quietly report success. If chats ever start being
   * written without a resolved user, give `Chat.igid` a blind index rather than
   * adding a filter here that cannot work.
   */
  await deleteCloudinaryAssets(assetIds, report);

  outstanding.push(CUSTOMER_COLLECTION_NOTE);

  return { report, outstanding };
};

/**
 * Resolve whichever identifier Meta gave us to a local user.
 *
 * The callbacks carry an app-scoped id. That is stored as `asid`, and both it and
 * `instagramUserId` are encrypted, so neither is directly queryable — only
 * `instagramUserId` has a blind index. Try that first, then fall back to scanning
 * for `asid`, which is bounded by the number of Instagram-connected users.
 */
export const findUserByMetaId = async (metaUserId) => {
  if (!metaUserId) return null;

  const byInstagramId = await User.findOne({ instagramUserId: metaUserId });
  if (byInstagramId) return byInstagramId;

  const connected = await User.find({
    instagramUserId: { $ne: null },
  }).select("asid igid instagramUserId");

  return (
    connected.find(
      (user) =>
        String(user.asid) === String(metaUserId) ||
        String(user.igid) === String(metaUserId),
    ) || null
  );
};

/**
 * Clear the Instagram connection without deleting the account. Used by the
 * Deauthorize callback: the user revoked our app, they did not ask us to delete
 * their Sulio account.
 */
export const disconnectInstagram = async (user) => {
  user.instagramUserId = null;
  user.instagramAccessToken = null;
  user.instagramUsername = null;
  user.instagramProfilePictureUrl = null;
  user.instagramFollowersCount = 0;
  user.instagramBio = null;
  user.instagramWebsite = null;
  user.instagramTokenExpiresAt = null;
  user.igid = null;
  user.asid = null;
  await user.save();
};

/**
 * Record and run a deletion. Always returns a confirmation code, even on failure,
 * so Meta gets a status URL it can poll and we keep an audit row either way.
 */
export const runDeletionRequest = async ({
  source,
  userId = null,
  asid = null,
  instagramUserId = null,
  email = null,
}) => {
  const confirmationCode = generateConfirmationCode();

  const request = await DeletionRequest.create({
    confirmationCode,
    source,
    userId,
    asid,
    instagramUserId,
    email,
    status: "pending",
  });

  try {
    const { report, outstanding } = await deleteUserData({ userId });

    request.deleted = report;
    request.outstanding = outstanding;
    request.status = outstanding.length > 0 ? "partial" : "completed";
    request.completedAt = new Date();
    await request.save();
  } catch (error) {
    request.status = "failed";
    request.error = error.message;
    await request.save();
    throw error;
  }

  return { confirmationCode, request };
};

export const isValidObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(String(value || ""));
