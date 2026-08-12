import crypto from "crypto";
import OAuthState from "../model/oauthState.Model.js";
import PendingInstagramRegistration from "../model/pendingInstagramRegistration.Model.js";
import { hashValue } from "./encryption.js";

/**
 * The two single-use secrets in the Instagram flow: the OAuth `state` nonce that
 * proves a callback belongs to the browser that started it, and the handoff id
 * that stands in for a pending registration.
 *
 * Both follow the same discipline: 256 bits of randomness handed out once, only
 * a hash persisted, and consumption via a conditional atomic update so two
 * concurrent callers cannot both win.
 */

const STATE_TTL_MS = 10 * 60 * 1000;
const HANDOFF_TTL_MS = 15 * 60 * 1000;

const NONCE_PURPOSE = "OAuthState.nonce";
const HANDOFF_PURPOSE = "PendingInstagramRegistration.handoff";

const randomId = () => crypto.randomBytes(32).toString("base64url");

/** Thrown for anything a caller should see as a 401 rather than a 500. */
export class OAuthStateError extends Error {
  constructor(message) {
    super(message);
    this.name = "OAuthStateError";
    this.statusCode = 401;
  }
}

/**
 * Issue a nonce and return the `state` string to send to Instagram.
 * The intent is carried in the clear alongside it because the callback page needs
 * to know which flow to run before it can talk to us — it is not a secret, and it
 * is re-verified against the stored record on the way back.
 */
export const issueOAuthState = async (intent, userId = null) => {
  const nonce = randomId();

  await OAuthState.create({
    nonceHash: hashValue(nonce, NONCE_PURPOSE),
    intent,
    userId: userId || null,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  return `${intent}.${nonce}`;
};

/**
 * Verify and burn a nonce. Returns the stored record.
 *
 * The `usedAt: null` term inside the filter is what makes this single-use: the
 * update is the check, so a replayed callback finds nothing to match rather than
 * racing a separate read.
 */
export const consumeOAuthState = async (state, intent, userId = null) => {
  const raw = typeof state === "string" ? state : "";
  const separator = raw.indexOf(".");
  const nonce = separator === -1 ? "" : raw.slice(separator + 1);

  if (!nonce) {
    throw new OAuthStateError(
      "Missing OAuth state. Please start the Instagram flow again.",
    );
  }

  const record = await OAuthState.findOneAndUpdate(
    {
      nonceHash: hashValue(nonce, NONCE_PURPOSE),
      intent,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { new: false },
  );

  if (!record) {
    throw new OAuthStateError(
      "This Instagram link has expired or was already used. Please try again.",
    );
  }

  // A `connect` callback landing on a different session than the one that asked
  // for it is the takeover attempt this whole mechanism exists to stop.
  if (intent === "connect" && String(record.userId) !== String(userId)) {
    throw new OAuthStateError(
      "This Instagram link does not belong to the signed-in account.",
    );
  }

  return record;
};

/**
 * Park an Instagram identity server-side and return the opaque id the browser
 * will carry through the registration form.
 */
export const createRegistrationHandoff = async (data) => {
  const handoffId = randomId();

  await PendingInstagramRegistration.create({
    handoffHash: hashValue(handoffId, HANDOFF_PURPOSE),
    ...data,
    expiresAt: new Date(Date.now() + HANDOFF_TTL_MS),
  });

  return handoffId;
};

/**
 * Look up a pending registration without consuming it — used by the two OTP
 * steps, which may legitimately run more than once (a resend, a mistyped code).
 */
export const findRegistrationHandoff = async (handoffId) => {
  if (!handoffId || typeof handoffId !== "string") {
    throw new OAuthStateError("A registration handoff id is required.");
  }

  const record = await PendingInstagramRegistration.findOne({
    handoffHash: hashValue(handoffId, HANDOFF_PURPOSE),
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!record) {
    throw new OAuthStateError(
      "Your registration session has expired. Please connect Instagram again.",
    );
  }

  return record;
};

/**
 * Burn a pending registration. Called once, at the moment the account is created.
 */
export const consumeRegistrationHandoff = async (handoffId) => {
  if (!handoffId || typeof handoffId !== "string") {
    throw new OAuthStateError("A registration handoff id is required.");
  }

  const record = await PendingInstagramRegistration.findOneAndUpdate(
    {
      handoffHash: hashValue(handoffId, HANDOFF_PURPOSE),
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { usedAt: new Date() } },
    { new: true },
  );

  if (!record) {
    throw new OAuthStateError(
      "Your registration session has expired or was already completed.",
    );
  }

  return record;
};

export const markHandoffEmailVerified = async (handoffId, email) => {
  const record = await PendingInstagramRegistration.findOneAndUpdate(
    {
      handoffHash: hashValue(handoffId, HANDOFF_PURPOSE),
      usedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { emailVerifiedFor: email } },
    { new: true },
  );

  if (!record) {
    throw new OAuthStateError(
      "Your registration session has expired. Please connect Instagram again.",
    );
  }

  return record;
};
