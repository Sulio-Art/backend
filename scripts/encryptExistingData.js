/**
 * One-off backfill: encrypt the plaintext already sitting in MongoDB.
 *
 * Reads the same registry the models use (conifg/encryptedFields.js), so it can
 * never drift out of sync with what the application expects.
 *
 * Safe to re-run: values that are already enveloped are skipped, and a document
 * with nothing left to change is not written.
 *
 * Usage:
 *   node scripts/encryptExistingData.js                      # dry run, changes nothing
 *   node scripts/encryptExistingData.js --apply              # write
 *   node scripts/encryptExistingData.js --apply --only=User  # one model
 *   node scripts/encryptExistingData.js --apply --drop-legacy-indexes
 *
 * Order of operations for a production rollout:
 *   1. Set DATA_ENCRYPTION_KEY and BLIND_INDEX_KEY. Back them up somewhere other
 *      than the database — without them the encrypted data is gone for good.
 *   2. Take a snapshot of the cluster.
 *   3. Deploy the code with ENCRYPTION_DUAL_READ=true (the default). New writes
 *      are encrypted; old plaintext rows still read and still match lookups.
 *   4. Run this with --apply, then again with --apply --drop-legacy-indexes.
 *   5. Verify: login, OTP, Instagram link, chat, diary, profile.
 *   6. Set ENCRYPTION_DUAL_READ=false and redeploy. Plaintext is no longer
 *      queryable, which closes the fallback path.
 */

import "dotenv/config";
import mongoose from "mongoose";

import { ENCRYPTED_FIELDS } from "../conifg/encryptedFields.js";
import {
  ENCRYPTION_ENABLED,
  encryptValue,
  isEncrypted,
  blindIndex,
  hashValue,
  assertEncryptionConfigured,
} from "../utils/encryption.js";

const BATCH_SIZE = 200;

// Collection names mongoose derives from each model name, plus the ones that
// were overridden in the model file.
const COLLECTIONS = {
  User: "users",
  Otp: "otps",
  Chat: "chats",
  ChatLog: "chatlogs",
  TestChat: "testchats",
  DiaryEntry: "diaryentries",
  Profile: "profiles",
  Artwork: "artworks",
  Event: "events",
  Transaction: "transactions",
};

// Unique/lookup indexes that used to live on now-encrypted fields. Randomized
// ciphertext makes them useless, and mongoose will not remove them on its own.
const LEGACY_INDEXES = {
  users: ["email_1", "phoneNumber_1"],
  otps: ["email_1"],
};

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const DROP_LEGACY = argv.includes("--drop-legacy-indexes");
const ONLY = (argv.find((a) => a.startsWith("--only=")) || "").split("=")[1];

const isEmpty = (v) => v === null || v === undefined || v === "";

/** Encrypt every value at `segments` inside `doc`, recording what changed. */
const encodePath = (container, segments, json, onChange) => {
  if (container === null || typeof container !== "object") return;

  if (Array.isArray(container)) {
    for (const element of container) encodePath(element, segments, json, onChange);
    return;
  }

  const [head, ...rest] = segments;

  if (head === "*") {
    for (const key of Object.keys(container)) {
      if (rest.length === 0) {
        const current = container[key];
        if (isEmpty(current) || isEncrypted(current)) continue;
        container[key] = encryptValue(
          json && typeof current !== "string"
            ? JSON.stringify(current)
            : current,
        );
        onChange();
      } else {
        encodePath(container[key], rest, json, onChange);
      }
    }
    return;
  }

  if (rest.length > 0) {
    encodePath(container[head], rest, json, onChange);
    return;
  }

  const current = container[head];
  if (isEmpty(current) || isEncrypted(current)) return;
  if (!json && typeof current === "object") return; // never blindly encrypt a structure
  container[head] = encryptValue(
    json && typeof current !== "string" ? JSON.stringify(current) : current,
  );
  onChange();
};

const HEX_64 = /^[a-f0-9]{64}$/;

const migrateModel = async (db, modelName, options) => {
  const collectionName = COLLECTIONS[modelName];
  if (!collectionName) {
    console.warn(`  ! ${modelName}: no collection mapping, skipped`);
    return;
  }

  const collection = db.collection(collectionName);
  const total = await collection.countDocuments();

  const specs = [
    ...(options.encrypt || []).map((p) => ({ segments: p.split("."), json: false })),
    ...(options.json || []).map((p) => ({ segments: p.split("."), json: true })),
  ];
  const blindIndexes = Object.entries(options.blindIndex || {});
  const hashes = options.hash || [];

  let scanned = 0;
  let changed = 0;
  let pending = [];

  const flush = async () => {
    if (pending.length === 0) return;
    if (APPLY) await collection.bulkWrite(pending, { ordered: false });
    pending = [];
  };

  const cursor = collection.find({}, { batchSize: BATCH_SIZE });

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    scanned += 1;

    const set = {};
    let touched = false;
    const markTouched = () => {
      touched = true;
    };

    // Blind indexes and hashes read the plaintext, so they go first.
    for (const [path, indexField] of blindIndexes) {
      const value = doc[path];
      if (isEmpty(value) || isEncrypted(value)) continue;
      const digest = blindIndex(value, `${modelName}.${path}`);
      if (digest && doc[indexField] !== digest) {
        set[indexField] = digest;
        touched = true;
      }
    }

    for (const path of hashes) {
      const value = doc[path];
      if (isEmpty(value)) continue;
      if (typeof value === "string" && HEX_64.test(value)) continue;
      set[path] = hashValue(value, `${modelName}.${path}`);
      touched = true;
    }

    for (const spec of specs) {
      const root = spec.segments[0];
      if (!(root in doc)) continue;

      // Work on a copy so a mid-document failure cannot half-write.
      const branch = JSON.parse(JSON.stringify({ [root]: doc[root] }));
      let branchChanged = false;
      encodePath(branch, spec.segments, spec.json, () => {
        branchChanged = true;
      });
      if (branchChanged) {
        set[root] = branch[root];
        markTouched();
      }
    }

    if (!touched) continue;
    changed += 1;
    pending.push({
      updateOne: { filter: { _id: doc._id }, update: { $set: set } },
    });
    if (pending.length >= BATCH_SIZE) await flush();
  }

  await flush();

  console.log(
    `  ${modelName.padEnd(12)} scanned ${scanned}/${total}, ${APPLY ? "updated" : "would update"} ${changed}`,
  );
};

const dropLegacyIndexes = async (db) => {
  console.log("\nLegacy indexes on now-encrypted fields:");
  for (const [collectionName, indexNames] of Object.entries(LEGACY_INDEXES)) {
    const collection = db.collection(collectionName);
    let existing;
    try {
      existing = (await collection.indexes()).map((i) => i.name);
    } catch {
      continue; // collection does not exist yet
    }
    for (const name of indexNames) {
      if (!existing.includes(name)) continue;
      if (APPLY) {
        await collection.dropIndex(name);
        console.log(`  dropped ${collectionName}.${name}`);
      } else {
        console.log(`  would drop ${collectionName}.${name}`);
      }
    }
  }
};

const main = async () => {
  if (!ENCRYPTION_ENABLED) {
    throw new Error(
      "ENCRYPTION_ENABLED is false. Nothing to migrate — turn it on first.",
    );
  }
  assertEncryptionConfigured();

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set.");

  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB_NAME,
  });
  const db = mongoose.connection.db;

  console.log(
    `\n${APPLY ? "APPLYING" : "DRY RUN (pass --apply to write)"} against "${db.databaseName}"\n`,
  );

  const models = ONLY ? [ONLY] : Object.keys(ENCRYPTED_FIELDS);
  for (const modelName of models) {
    const options = ENCRYPTED_FIELDS[modelName];
    if (!options) {
      console.warn(`  ! ${modelName} is not in the registry, skipped`);
      continue;
    }
    await migrateModel(db, modelName, options);
  }

  if (DROP_LEGACY) await dropLegacyIndexes(db);

  console.log(
    APPLY
      ? "\nDone. Verify login, OTP, Instagram link, chat, diary and profile before setting ENCRYPTION_DUAL_READ=false."
      : "\nDry run complete. Re-run with --apply to write.",
  );

  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error("\nMigration failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
