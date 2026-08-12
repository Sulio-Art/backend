/**
 * The single place that records which fields are encrypted, and why the rest
 * are not.
 *
 * Read this before adding a query, an index, or an aggregation over any field
 * listed here — encrypted fields are opaque to MongoDB. `$regex`, ranges,
 * `sort`, `$sum` and `$group` do not work on them, and equality only works
 * through a blind index.
 *
 * Modes:
 *   encrypt     AES-256-GCM, randomized. Read back as plaintext. Not queryable.
 *   json        Same, but the value is JSON round-tripped (for Mixed fields).
 *   blindIndex  Encrypts the field AND maintains a deterministic HMAC companion
 *               field, so equality lookups still work. Queries on the original
 *               path are rewritten onto the companion. Listing a path here is
 *               enough — it does not also need to appear under `encrypt`.
 *   hash        One-way HMAC, in place. The plaintext is never recoverable.
 *
 * Deliberately NOT encrypted, with reasons:
 *
 *   Customer (users_backend1)   Written by an external Python service with
 *                               `strict: false`. Encrypting from Node only
 *                               would corrupt that integration. Needs to be
 *                               handled on the Python side first.
 *   Artwork.title               `$regex` search and `sort` — artWork.controller.js:118,133
 *   Artwork.size                `$sum` aggregation — artWork.controller.js:46,189
 *   Artwork.tag / .status /
 *     .artworkType / .price     Filter and sort facets — artWork.controller.js:120-127
 *   Transaction.paypalOrderId   `$regex` search and a unique index — transaction.Controller.js:80
 *   Transaction.status          `$regex` search and equality filter — transaction.Controller.js:81,86
 *   Subscription.razorpay*      Payment-provider references needed for
 *                               reconciliation and support lookups.
 *   Event.title / .startTime    Sorted and range-filtered — event.Controller.js:33
 *   *.imageUrls, profilePicture,
 *     coverPhoto, artworkPhotos Cloudinary URLs. Already public to anyone
 *                               holding the URL, so encrypting the database
 *                               copy buys nothing.
 *   User.password               Already bcrypt-hashed by the model.
 *   OAuthState.*                `nonceHash` is already a one-way hash; `intent`
 *                               and `userId` must stay queryable. No plaintext
 *                               secret in the document.
 *   PendingInstagram-
 *     Registration.handoffHash  One-way hash used as the lookup key.
 *   DeletionRequest.
 *     confirmationCode          Random opaque token, not personal data, and the
 *                               public status page looks documents up by it.
 *   All ObjectId references     Needed for joins, `populate`, and indexes.
 */

import fieldEncryption from "../utils/mongooseEncryption.js";

export const ENCRYPTED_FIELDS = {
  User: {
    encrypt: [
      "firstName",
      "lastName",
      "instagramAccessToken",
      "instagramUsername",
      "instagramBio",
      "instagramWebsite",
      "igid",
      "asid",
    ],
    // Looked up by equality in auth, chat routing and the chatbot service.
    blindIndex: {
      email: "emailIndex",
      phoneNumber: "phoneNumberIndex",
      instagramUserId: "instagramUserIdIndex",
    },
  },

  Otp: {
    // Otp.findOne({ email }) and Otp.findOne({ email, otp }) both stay working:
    // the filter rewriter maps `email` onto the blind index and `otp` onto its
    // hash.
    blindIndex: { email: "emailIndex" },
    hash: ["otp"],
  },

  Chat: {
    encrypt: ["query", "response", "summary", "igid"],
  },

  ChatLog: {
    encrypt: ["messages.text"],
  },

  TestChat: {
    encrypt: ["messages.content"],
  },

  DiaryEntry: {
    encrypt: ["subject", "description", "studioLife"],
  },

  Profile: {
    encrypt: [
      "bio",
      "website",
      "location",
      "socialLinks.instagram",
      "socialLinks.twitter",
      "socialLinks.portfolio",
      // Free-form chatbot persona settings, written by dotted $set paths.
      "chatbotSettings.*",
    ],
  },

  Artwork: {
    encrypt: ["description", "creativeInsights", "technicalIssues"],
  },

  Event: {
    encrypt: ["description", "location", "externalLink"],
  },

  Transaction: {
    // Raw PayPal / Razorpay payloads: payer name, email and address.
    json: ["details"],
  },

  PendingInstagramRegistration: {
    // Holds a live Instagram access token for up to 15 minutes. Nothing here is
    // queried — the document is always found by `handoffHash` first — so no
    // blind index is needed.
    encrypt: [
      "instagramUserId",
      "instagramUsername",
      "instagramAccessToken",
      "igid",
      "asid",
      "emailVerifiedFor",
    ],
    json: ["profileSnapshot"],
  },

  DeletionRequest: {
    encrypt: ["asid", "instagramUserId", "email"],
  },
};

/**
 * Attach field encryption to a schema using the registry above.
 * A model with no registry entry is left alone.
 */
export const applyFieldEncryption = (schema, modelName) => {
  const options = ENCRYPTED_FIELDS[modelName];
  if (!options) return schema;
  schema.plugin(fieldEncryption, { modelName, ...options });
  return schema;
};

export default ENCRYPTED_FIELDS;
