/**
 * Verifies the encryption layer end to end without needing a database, by
 * invoking the registered mongoose middleware directly against real models.
 *
 *   node scripts/verifyEncryption.mjs
 *
 * Run this after touching utils/encryption.js, utils/mongooseEncryption.js or
 * conifg/encryptedFields.js. It uses throwaway keys generated in-process, so it
 * never reads or writes real data.
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

const enc = await import("../utils/encryption.js");
const { rewriteFilter, normalizeOptions, matchKeyToPattern, walkPath } =
  await import("../utils/mongooseEncryption.js");

// ---- primitives ------------------------------------------------------------

check("roundtrip", () => {
  const ct = enc.encryptValue("hello@example.com");
  assert.ok(ct.startsWith("enc:v1:k1:"));
  assert.strictEqual(enc.decryptValue(ct), "hello@example.com");
});

check("randomized IV: same plaintext -> different ciphertext", () => {
  assert.notStrictEqual(enc.encryptValue("x"), enc.encryptValue("x"));
});

check("encrypt is idempotent", () => {
  const ct = enc.encryptValue("a");
  assert.strictEqual(enc.encryptValue(ct), ct);
});

check("decrypt passes plaintext through (dual read)", () => {
  assert.strictEqual(enc.decryptValue("legacy@plain.com"), "legacy@plain.com");
});

check("tampering throws", () => {
  const ct = enc.encryptValue("secret");
  const parts = ct.split(":");
  parts[5] = Buffer.from("tampered!!!!").toString("base64");
  assert.throws(() => enc.decryptValue(parts.join(":")));
});

check("unicode survives", () => {
  const s = "héllo — 日本語 🎨";
  assert.strictEqual(enc.decryptValue(enc.encryptValue(s)), s);
});

check("blind index is deterministic and case/space insensitive", () => {
  const a = enc.blindIndex(" A@B.com ", "User.email");
  const b = enc.blindIndex("a@b.com", "User.email");
  assert.strictEqual(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
});

check("domain separation: same value, different purpose -> different digest", () => {
  assert.notStrictEqual(
    enc.blindIndex("a@b.com", "User.email"),
    enc.blindIndex("a@b.com", "Otp.email"),
  );
  assert.notStrictEqual(
    enc.blindIndex("480000", "Otp.otp"),
    enc.hashValue("480000", "Otp.otp"),
  );
});

check("hashValue is case sensitive; hashMatches compares", () => {
  const h = enc.hashValue("123456", "Otp.otp");
  assert.ok(enc.hashMatches("123456", h, "Otp.otp"));
  assert.ok(!enc.hashMatches("123457", h, "Otp.otp"));
  assert.ok(!enc.hashMatches("123456", h, "Otp.email"));
  assert.ok(!enc.hashMatches("123456", null, "Otp.otp"));
  assert.ok(!enc.hashMatches("123456", "short", "Otp.otp"));
});

check("malformed envelope throws rather than returning garbage", () => {
  assert.throws(() => enc.decryptValue("enc:v1:k1:onlythree"));
  assert.throws(() => enc.decryptValue("enc:v1:k9:AAAA:AAAA:AAAA"), /No key/);
});

check("empty and null values are left alone", () => {
  assert.strictEqual(enc.encryptValue(""), "");
  assert.strictEqual(enc.encryptValue(null), null);
  assert.strictEqual(enc.blindIndex(""), "");
  assert.strictEqual(enc.hashValue(null), null);
});

// ---- path matching ---------------------------------------------------------

check("matchKeyToPattern", () => {
  assert.deepStrictEqual(matchKeyToPattern(["email"], ["email"]), { rest: [] });
  assert.deepStrictEqual(
    matchKeyToPattern(["messages", "0", "content"], ["messages", "content"]),
    { rest: [] },
  );
  // whole subtree replaced: pattern remainder applies inside the value
  assert.deepStrictEqual(
    matchKeyToPattern(["socialLinks"], ["socialLinks", "instagram"]),
    { rest: ["instagram"] },
  );
  assert.deepStrictEqual(
    matchKeyToPattern(["chatbotSettings", "tone"], ["chatbotSettings", "*"]),
    { rest: [] },
  );
  assert.strictEqual(matchKeyToPattern(["password"], ["email"]), null);
  assert.strictEqual(
    matchKeyToPattern(["email", "deeper"], ["email"]),
    null,
  );
});

check("walkPath over arrays and maps", () => {
  const doc = {
    messages: [{ content: "a" }, { content: "b" }],
    settings: new Map([["tone", "warm"]]),
  };
  walkPath(doc, ["messages", "content"], (v) => v.toUpperCase());
  walkPath(doc, ["settings", "*"], (v) => v.toUpperCase());
  assert.deepStrictEqual(doc.messages, [{ content: "A" }, { content: "B" }]);
  assert.strictEqual(doc.settings.get("tone"), "WARM");
});

// ---- filter rewriting ------------------------------------------------------

const userConfig = normalizeOptions({
  modelName: "User",
  encrypt: ["firstName"],
  blindIndex: {
    email: "emailIndex",
    instagramUserId: "instagramUserIdIndex",
  },
});

check("dual-read filter keeps both branches", () => {
  const f = rewriteFilter({ email: "a@b.com" }, userConfig);
  assert.ok(!("email" in f), "plaintext email key should be removed");
  assert.strictEqual(f.$and.length, 1);
  const branches = f.$and[0].$or;
  assert.strictEqual(branches[0].emailIndex, enc.blindIndex("a@b.com", "User.email"));
  assert.strictEqual(branches[1].email, "a@b.com");
});

check("two indexed fields in one filter do not collide", () => {
  const f = rewriteFilter(
    { email: "a@b.com", instagramUserId: "ig-1", isVerified: true },
    userConfig,
  );
  assert.strictEqual(f.$and.length, 2, "each field gets its own $and clause");
  assert.strictEqual(f.isVerified, true, "untouched fields survive");
});

check("$or children are rewritten (the Instagram signup lookup)", () => {
  const f = rewriteFilter(
    { $or: [{ instagramUserId: "ig-1" }, { email: "a@b.com" }] },
    userConfig,
  );
  assert.strictEqual(f.$or.length, 2);
  for (const child of f.$or) {
    assert.ok(child.$and, "each branch translated independently");
  }
});

check("$in is translated", () => {
  const f = rewriteFilter({ email: { $in: ["a@b.com", "c@d.com"] } }, userConfig);
  const indexed = f.$and[0].$or[0].emailIndex.$in;
  assert.deepStrictEqual(indexed, [
    enc.blindIndex("a@b.com", "User.email"),
    enc.blindIndex("c@d.com", "User.email"),
  ]);
});

check("hash filter rewriting (Otp.findOne({email, otp}))", () => {
  const otpConfig = normalizeOptions({
    modelName: "Otp",
    blindIndex: { email: "emailIndex" },
    hash: ["otp"],
  });
  const f = rewriteFilter({ email: "a@b.com", otp: "123456" }, otpConfig);
  assert.strictEqual(f.$and.length, 2);
  const otpClause = f.$and.find((c) => "otp" in c.$or[0]);
  assert.strictEqual(otpClause.$or[0].otp, enc.hashValue("123456", "Otp.otp"));
  assert.strictEqual(otpClause.$or[1].otp, "123456");
});

// ---- middleware on real models (no database) -------------------------------

const mongoose = (await import("mongoose")).default;
// Mongoose registers its own internal middleware alongside ours; several of
// those need a live connection. Run only the plugin's hooks plus the model's
// own (anonymous) ones.
const SKIP_HOOKS = new Set([
  "validateBeforeSave",
  "saveSubdocsPreSave",
  "timestampsPreSave",
  "shardingPluginPreSave",
  "trackTransactionPreSave",
  "_setDefaultsOnInsert",
  "castArrayFilters",
]);

const runPre = async (schema, name, ctx, ...extra) => {
  const hooks = schema.s.hooks._pres.get(name) || [];
  for (const hook of hooks) {
    if (SKIP_HOOKS.has(hook.fn.name) || hook.fn.length === 0) continue;
    await new Promise((resolve, reject) => {
      const done = (err) => (err ? reject(err) : resolve());
      hook.fn.call(ctx, done, ...extra);
    });
  }
};
const runPost = async (schema, name, ctx, arg) => {
  const hooks = schema.s.hooks._posts.get(name) || [];
  for (const hook of hooks) hook.fn.call(ctx, arg);
};

const User = (await import("../model/user.model.js")).default;
const Otp = (await import("../model/otp.model.js")).default;
const Profile = (await import("../model/profile.Model.js")).default;
const TestChat = (await import("../model/testChat.Model.js")).default;

await checkAsync("User pre-save encrypts and indexes", async () => {
  const doc = new User({
    firstName: "Ada",
    lastName: "Lovelace",
    email: "Ada@Example.com",
    password: "hunter2",
    instagramUserId: "ig-42",
  });
  await runPre(User.schema, "save", doc);

  assert.ok(enc.isEncrypted(doc.email), "email encrypted");
  assert.ok(enc.isEncrypted(doc.firstName), "firstName encrypted");
  assert.ok(enc.isEncrypted(doc.instagramUserId), "instagramUserId encrypted");
  assert.strictEqual(
    doc.emailIndex,
    enc.blindIndex("Ada@Example.com", "User.email"),
    "blind index computed from plaintext, not ciphertext",
  );
  assert.strictEqual(
    doc.instagramUserIdIndex,
    enc.blindIndex("ig-42", "User.instagramUserId"),
  );
  assert.ok(!doc.phoneNumberIndex, "absent field gets no index");
  // bcrypt still ran on the plaintext password
  assert.ok(doc.password.startsWith("$2"), "password bcrypt-hashed");

  // post-save hands plaintext back to the caller
  await runPost(User.schema, "save", doc, doc);
  assert.strictEqual(doc.email, "Ada@Example.com");
  assert.strictEqual(doc.firstName, "Ada");
});

await checkAsync("post-init decrypts what a read returns", async () => {
  const doc = new User({
    firstName: "Ada",
    email: "ada@example.com",
    lastName: "L",
    password: "x",
  });
  doc.email = enc.encryptValue("ada@example.com");
  doc.firstName = enc.encryptValue("Ada");
  await runPost(User.schema, "init", doc);
  assert.strictEqual(doc.email, "ada@example.com");
  assert.strictEqual(doc.firstName, "Ada");
});

await checkAsync("Otp bare-replacement upsert encrypts and adds the index", async () => {
  const query = Otp.findOneAndUpdate(
    { email: "a@b.com" },
    { email: "a@b.com", otp: "123456" },
    { upsert: true, new: true },
  );
  await runPre(Otp.schema, "findOneAndUpdate", query);

  const update = query.getUpdate();
  assert.ok(enc.isEncrypted(update.email), "email encrypted in the update");
  assert.strictEqual(update.otp, enc.hashValue("123456", "Otp.otp"), "otp hashed");
  assert.strictEqual(
    update.emailIndex,
    enc.blindIndex("a@b.com", "Otp.email"),
    "index at top level, not mixed with operators",
  );
  assert.ok(
    !update.$set || !("emailIndex" in update.$set),
    "the index stays in the same bucket as the value it came from",
  );

  const filter = query.getFilter();
  assert.ok(filter.$and, "filter rewritten for the blind index");
});

await checkAsync("Profile dotted $set on a Map wildcard", async () => {
  const query = Profile.updateOne(
    { userId: new mongoose.Types.ObjectId() },
    { $set: { "chatbotSettings.tone": "warm", isChatbotConfigured: true } },
  );
  await runPre(Profile.schema, "updateOne", query);
  const update = query.getUpdate();
  assert.ok(
    enc.isEncrypted(update.$set["chatbotSettings.tone"]),
    "wildcard matched the dotted path",
  );
  assert.strictEqual(
    update.$set.isChatbotConfigured,
    true,
    "unconfigured field untouched",
  );
});

await checkAsync("Profile whole-subtree $set on socialLinks", async () => {
  const query = Profile.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId() },
    { $set: { socialLinks: { instagram: "@ada", twitter: "@ada2" }, bio: "hi" } },
  );
  await runPre(Profile.schema, "findOneAndUpdate", query);
  const s = query.getUpdate().$set;
  assert.ok(enc.isEncrypted(s.socialLinks.instagram), "nested instagram encrypted");
  assert.ok(enc.isEncrypted(s.socialLinks.twitter), "nested twitter encrypted");
  assert.ok(enc.isEncrypted(s.bio), "bio encrypted");
});

await checkAsync("TestChat $push $each encrypts message content", async () => {
  const query = TestChat.findOneAndUpdate(
    { conversationId: "c1" },
    {
      $push: {
        messages: {
          $each: [
            { role: "user", content: "hi" },
            { role: "assistant", content: "hello" },
          ],
        },
      },
      $setOnInsert: { userId: new mongoose.Types.ObjectId(), activeStep: "a" },
    },
    { upsert: true, new: true },
  );
  await runPre(TestChat.schema, "findOneAndUpdate", query);
  const pushed = query.getUpdate().$push.messages.$each;
  assert.ok(enc.isEncrypted(pushed[0].content));
  assert.ok(enc.isEncrypted(pushed[1].content));
  assert.strictEqual(pushed[0].role, "user", "role stays cleartext");
});

await checkAsync("lean read decrypts (post-find hook)", async () => {
  const query = User.find({}).lean();
  const rows = [
    { email: enc.encryptValue("a@b.com"), firstName: enc.encryptValue("Ada") },
    { email: "legacy@plain.com", firstName: "Legacy" }, // not yet migrated
  ];
  await runPost(User.schema, "find", query, rows);
  assert.strictEqual(rows[0].email, "a@b.com");
  assert.strictEqual(rows[1].email, "legacy@plain.com", "dual read");
});

await checkAsync("Customer model is untouched", async () => {
  const Customer = (await import("../model/customer.model.js")).default;
  const doc = new Customer({ recipient_id: "r", sender_id: "s", summary: "x" });
  await runPre(Customer.schema, "save", doc);
  assert.strictEqual(doc.summary, "x", "external Python integration preserved");
});

// ---- report ----------------------------------------------------------------

console.log();
for (const [status, name] of results) {
  console.log(`${status}  ${name}`);
}
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
