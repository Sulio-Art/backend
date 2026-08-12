/**
 * Verifies the Meta-compliance work from META-COMPLIANCE-PLAN.md Part 1 without
 * needing a database.
 *
 *   node scripts/verifyMetaCompliance.mjs
 *
 * `signed_request` parsing is pure and tested directly. The single-use secrets in
 * utils/oauthHandoff.js normally talk to Mongo, so the two models they use are
 * swapped for an in-memory store that implements the same filter semantics — the
 * point of those tests is the consumption logic (single use, expiry, session
 * binding), not the driver.
 *
 * Run this after touching utils/metaSignedRequest.js, utils/oauthHandoff.js or the
 * three new models.
 */

import assert from "assert";
import crypto from "crypto";

process.env.DATA_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
process.env.BLIND_INDEX_KEY = crypto.randomBytes(32).toString("base64");
process.env.DATA_ENCRYPTION_KEY_ID = "k1";
process.env.ENCRYPTION_ENABLED = "true";
process.env.ENCRYPTION_DUAL_READ = "true";

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + " :: " + e.message]);
  }
};
const checkAsync = async (name, fn) => {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + " :: " + e.message]);
  }
};

/** Assert that an async call rejects, and return the error for inspection. */
const rejects = async (fn, messageFragment) => {
  let error = null;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  assert.ok(error, "expected a rejection, got none");
  if (messageFragment) {
    assert.ok(
      error.message.includes(messageFragment),
      `expected message to include "${messageFragment}", got "${error.message}"`,
    );
  }
  return error;
};

// ---- signed_request --------------------------------------------------------

const { parseSignedRequest } = await import("../utils/metaSignedRequest.js");

const APP_SECRET = "test-app-secret";

const b64url = (buffer) => Buffer.from(buffer).toString("base64url");

const makeSignedRequest = (payload, secret = APP_SECRET) => {
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
  return `${sig}.${payloadB64}`;
};

check("signed_request: valid request parses", () => {
  const payload = {
    algorithm: "HMAC-SHA256",
    user_id: "17841400000000000",
    issued_at: 1700000000,
  };
  const parsed = parseSignedRequest(makeSignedRequest(payload), APP_SECRET);
  assert.strictEqual(parsed.user_id, "17841400000000000");
});

check("signed_request: tampered payload is rejected", () => {
  const signed = makeSignedRequest({
    algorithm: "HMAC-SHA256",
    user_id: "victim",
  });
  const [sig] = signed.split(".");
  const forged = `${sig}.${b64url(
    JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "attacker" }),
  )}`;
  assert.throws(() => parseSignedRequest(forged, APP_SECRET));
});

check("signed_request: tampered signature is rejected", () => {
  const signed = makeSignedRequest({
    algorithm: "HMAC-SHA256",
    user_id: "u1",
  });
  const [sig, payload] = signed.split(".");
  // Flip one character of the signature.
  const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  assert.throws(() => parseSignedRequest(`${flipped}.${payload}`, APP_SECRET));
});

check("signed_request: signature from the wrong secret is rejected", () => {
  const signed = makeSignedRequest(
    { algorithm: "HMAC-SHA256", user_id: "u1" },
    "not-our-secret",
  );
  assert.throws(() => parseSignedRequest(signed, APP_SECRET));
});

check("signed_request: unexpected algorithm is rejected", () => {
  const signed = makeSignedRequest({ algorithm: "NONE", user_id: "u1" });
  assert.throws(() => parseSignedRequest(signed, APP_SECRET));
});

check("signed_request: malformed input is rejected, not crashed on", () => {
  for (const bad of ["", "nodot", ".", "a.", ".b", null, undefined, 42]) {
    assert.throws(
      () => parseSignedRequest(bad, APP_SECRET),
      `expected a throw for ${JSON.stringify(bad)}`,
    );
  }
});

check("signed_request: a missing app secret is rejected", () => {
  const signed = makeSignedRequest({ algorithm: "HMAC-SHA256", user_id: "u1" });
  assert.throws(() => parseSignedRequest(signed, ""));
});

// ---- in-memory stand-ins for the two single-use collections ----------------

const matches = (record, filter) =>
  Object.entries(filter).every(([key, condition]) => {
    const value = record[key];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("$gt" in condition) return value > condition.$gt;
      if ("$ne" in condition) return String(value) !== String(condition.$ne);
    }
    if (condition === null) return value === null || value === undefined;
    return String(value) === String(condition);
  });

const makeFakeCollection = () => {
  const rows = [];
  return {
    rows,
    async create(doc) {
      const row = { _id: `id-${rows.length + 1}`, usedAt: null, ...doc };
      rows.push(row);
      return row;
    },
    async findOne(filter) {
      return rows.find((row) => matches(row, filter)) || null;
    },
    async findOneAndUpdate(filter, update, options = {}) {
      const row = rows.find((r) => matches(r, filter));
      if (!row) return null;
      const before = { ...row };
      Object.assign(row, update.$set || {});
      return options.new === false ? before : row;
    },
  };
};

const OAuthState = (await import("../model/oauthState.Model.js")).default;
const PendingRegistration = (
  await import("../model/pendingInstagramRegistration.Model.js")
).default;

const stateStore = makeFakeCollection();
const handoffStore = makeFakeCollection();

for (const method of ["create", "findOne", "findOneAndUpdate"]) {
  OAuthState[method] = stateStore[method].bind(stateStore);
  PendingRegistration[method] = handoffStore[method].bind(handoffStore);
}

const {
  issueOAuthState,
  consumeOAuthState,
  createRegistrationHandoff,
  findRegistrationHandoff,
  consumeRegistrationHandoff,
  markHandoffEmailVerified,
} = await import("../utils/oauthHandoff.js");

// ---- OAuth state nonce -----------------------------------------------------

await checkAsync("state: issued value carries the intent and a nonce", async () => {
  const state = await issueOAuthState("login");
  const [intent, nonce] = state.split(".");
  assert.strictEqual(intent, "login");
  assert.ok(nonce && nonce.length >= 40, "nonce should be 256 bits of base64url");
  assert.ok(
    !stateStore.rows.some((row) => row.nonceHash === nonce),
    "the raw nonce must never be persisted",
  );
});

await checkAsync("state: a valid login nonce is accepted once", async () => {
  const state = await issueOAuthState("login");
  const record = await consumeOAuthState(state, "login");
  assert.strictEqual(record.intent, "login");
});

await checkAsync("state: replaying a nonce is rejected", async () => {
  const state = await issueOAuthState("login");
  await consumeOAuthState(state, "login");
  await rejects(
    () => consumeOAuthState(state, "login"),
    "expired or was already used",
  );
});

await checkAsync("state: a forged nonce is rejected", async () => {
  const forged = `login.${crypto.randomBytes(32).toString("base64url")}`;
  await rejects(() => consumeOAuthState(forged, "login"), "expired");
});

await checkAsync("state: missing or empty state is rejected", async () => {
  for (const bad of ["", "login", null, undefined, {}]) {
    await rejects(() => consumeOAuthState(bad, "login"), "Missing OAuth state");
  }
});

await checkAsync("state: a login nonce cannot be spent on connect", async () => {
  const state = await issueOAuthState("login");
  await rejects(() => consumeOAuthState(state, "connect", "user-1"), "expired");
});

await checkAsync(
  "state: a connect nonce issued to one session is rejected for another",
  async () => {
    const state = await issueOAuthState("connect", "user-1");
    // This is the takeover attempt: the victim's browser presenting the
    // attacker's callback.
    const error = await rejects(
      () => consumeOAuthState(state, "connect", "user-2"),
      "does not belong to the signed-in account",
    );
    assert.strictEqual(error.statusCode, 401);
  },
);

await checkAsync("state: a connect nonce works for its own session", async () => {
  const state = await issueOAuthState("connect", "user-3");
  const record = await consumeOAuthState(state, "connect", "user-3");
  assert.strictEqual(String(record.userId), "user-3");
});

await checkAsync("state: an expired nonce is rejected", async () => {
  const state = await issueOAuthState("login");
  const nonce = state.split(".")[1];
  const row = stateStore.rows[stateStore.rows.length - 1];
  assert.ok(row.expiresAt > new Date(), "should start in the future");
  row.expiresAt = new Date(Date.now() - 1000);
  await rejects(() => consumeOAuthState(`login.${nonce}`, "login"), "expired");
});

// ---- registration handoff --------------------------------------------------

const handoffFixture = {
  instagramUserId: "ig-123",
  instagramUsername: "ada",
  instagramAccessToken: "IGQVJ-long-lived-token",
  profileSnapshot: { id: "ig-123", username: "ada" },
  igid: "igid-1",
  asid: "asid-1",
};

await checkAsync(
  "handoff: the access token never leaves the server in the id",
  async () => {
    const handoffId = await createRegistrationHandoff(handoffFixture);
    assert.ok(
      !handoffId.includes("IGQVJ"),
      "the id must be opaque, not a payload",
    );
    // A JWT would be three dot-separated base64 segments; this must not be one.
    assert.ok(!handoffId.includes("."), "the id must not be a JWT");
    const row = handoffStore.rows[handoffStore.rows.length - 1];
    assert.notStrictEqual(row.handoffHash, handoffId, "only a hash is stored");
  },
);

await checkAsync("handoff: lookup does not consume it", async () => {
  const handoffId = await createRegistrationHandoff(handoffFixture);
  await findRegistrationHandoff(handoffId);
  const again = await findRegistrationHandoff(handoffId);
  assert.strictEqual(again.instagramUserId, "ig-123");
});

await checkAsync("handoff: consuming it twice fails", async () => {
  const handoffId = await createRegistrationHandoff(handoffFixture);
  const record = await consumeRegistrationHandoff(handoffId);
  assert.strictEqual(record.instagramAccessToken, "IGQVJ-long-lived-token");
  await rejects(
    () => consumeRegistrationHandoff(handoffId),
    "expired or was already completed",
  );
});

await checkAsync("handoff: a consumed record can no longer be found", async () => {
  const handoffId = await createRegistrationHandoff(handoffFixture);
  await consumeRegistrationHandoff(handoffId);
  await rejects(() => findRegistrationHandoff(handoffId), "expired");
});

await checkAsync("handoff: a forged id is rejected", async () => {
  await rejects(
    () => consumeRegistrationHandoff(crypto.randomBytes(32).toString("base64url")),
    "expired",
  );
  for (const bad of ["", null, undefined, 7]) {
    await rejects(() => consumeRegistrationHandoff(bad), "required");
  }
});

await checkAsync(
  "handoff: email verification is recorded server-side",
  async () => {
    const handoffId = await createRegistrationHandoff(handoffFixture);
    const before = await findRegistrationHandoff(handoffId);
    assert.ok(!before.emailVerifiedFor, "starts unverified");

    await markHandoffEmailVerified(handoffId, "ada@example.com");

    const record = await consumeRegistrationHandoff(handoffId);
    assert.strictEqual(record.emailVerifiedFor, "ada@example.com");
  },
);

await checkAsync(
  "handoff: an unverified record yields no email to register with",
  async () => {
    // `completeInstagramRegistration` refuses when `emailVerifiedFor` is unset,
    // which is what stops an account being created for an unproven address.
    const handoffId = await createRegistrationHandoff(handoffFixture);
    const record = await consumeRegistrationHandoff(handoffId);
    assert.ok(
      !record.emailVerifiedFor,
      "no verified address must be present without the OTP step",
    );
  },
);

await checkAsync("handoff: verification cannot be added after use", async () => {
  const handoffId = await createRegistrationHandoff(handoffFixture);
  await consumeRegistrationHandoff(handoffId);
  await rejects(
    () => markHandoffEmailVerified(handoffId, "late@example.com"),
    "expired",
  );
});

// ---- field registry --------------------------------------------------------

await checkAsync("registry: the new models encrypt the right fields", async () => {
  const { ENCRYPTED_FIELDS: encryptedFields } = await import(
    "../conifg/encryptedFields.js"
  );

  const pending = encryptedFields.PendingInstagramRegistration;
  assert.ok(pending, "PendingInstagramRegistration must be registered");
  for (const field of [
    "instagramUserId",
    "instagramAccessToken",
    "emailVerifiedFor",
  ]) {
    assert.ok(pending.encrypt.includes(field), `${field} must be encrypted`);
  }
  assert.ok(
    pending.json.includes("profileSnapshot"),
    "the profile snapshot is Platform Data and must be encrypted as JSON",
  );

  const deletion = encryptedFields.DeletionRequest;
  assert.ok(deletion.encrypt.includes("email"), "deletion email encrypted");
  assert.ok(
    !(deletion.encrypt || []).includes("confirmationCode"),
    "the confirmation code is looked up by equality and must stay queryable",
  );

  assert.ok(
    !encryptedFields.OAuthState,
    "OAuthState holds only a one-way hash and queryable metadata",
  );
});

// ---- deletion helpers ------------------------------------------------------

await checkAsync("deletion: Cloudinary public ids are recovered", async () => {
  const { publicIdFromUrl } = await import(
    "../services/accountDeletion.Service.js"
  );

  assert.strictEqual(
    publicIdFromUrl(
      "https://res.cloudinary.com/demo/image/upload/v1700000000/artworks/piece.jpg",
    ),
    "artworks/piece",
  );
  assert.strictEqual(
    publicIdFromUrl("https://res.cloudinary.com/demo/image/upload/plain.png"),
    "plain",
  );
  for (const bad of [null, undefined, "", "https://example.com/not-cloudinary"]) {
    assert.strictEqual(publicIdFromUrl(bad), null);
  }
});

// ---- report ----------------------------------------------------------------

console.log();
for (const [status, name] of results) {
  console.log(`${status}  ${name}`);
}
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
