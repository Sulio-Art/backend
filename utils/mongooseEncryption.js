/**
 * Mongoose plugin: transparent field-level encryption.
 *
 * Documents carry plaintext in memory and ciphertext in MongoDB. Controllers do
 * not change — they read and write plaintext as before.
 *
 * Usage:
 *
 *   schema.plugin(fieldEncryption, {
 *     modelName: "User",
 *     encrypt: ["email", "socialLinks.instagram", "messages.content"],
 *     blindIndex: { email: "emailIndex" },   // deterministic companion field
 *     hash: ["otp"],                          // one-way, never read back
 *     json: ["details"],                      // stringify, then encrypt
 *   });
 *
 * Path syntax:
 *   "email"                  a top-level field
 *   "socialLinks.instagram"  a nested field
 *   "messages.content"       a field on every element of an array
 *   "chatbotSettings.*"      every value of a Map or free-form object
 *
 * Hook coverage: save, insertMany, findOneAndUpdate, updateOne, updateMany,
 * replaceOne for writes; init plus lean-aware post-find hooks for reads; and
 * query-filter rewriting so equality lookups hit the blind index instead of the
 * (now unmatchable) encrypted field.
 *
 * Known gap: aggregation pipelines bypass this entirely. Never aggregate over an
 * encrypted path — see conifg/encryptedFields.js for the fields deliberately
 * left in cleartext because of that.
 */

import {
  ENCRYPTION_ENABLED,
  DUAL_READ,
  encryptValue,
  decryptValue,
  isEncrypted,
  blindIndex,
  hashValue,
} from "./encryption.js";

// Query middleware only — these names also exist as document middleware, and
// `this` would be a Document rather than a Query there.
const QUERY_MIDDLEWARE = { document: false, query: true };

const WRITE_QUERY_HOOKS = [
  "findOneAndUpdate",
  "updateOne",
  "updateMany",
  "replaceOne",
];

const READ_QUERY_HOOKS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
];

const FILTER_QUERY_HOOKS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
  "countDocuments",
  "distinct",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "replaceOne",
];

const HEX_64 = /^[a-f0-9]{64}$/;

const isPlainValue = (value) =>
  value === null ||
  value === undefined ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const isDigits = (segment) => /^\d+$/.test(segment);

const isEmpty = (value) =>
  value === null || value === undefined || value === "";

/**
 * Apply `fn` to every value reachable by `segments`, mutating in place.
 *
 * Handles mongoose documents, subdocument arrays, Maps and plain objects
 * uniformly. `fn` returns the replacement value, or undefined to leave it alone.
 *
 * @returns {boolean} whether anything actually changed
 */
const walkPath = (container, segments, fn) => {
  if (container === null || container === undefined) return false;

  // An array consumes no path segment — the same path applies to each element.
  if (Array.isArray(container)) {
    let changed = false;
    for (const element of container) {
      if (walkPath(element, segments, fn)) changed = true;
    }
    return changed;
  }

  const [head, ...rest] = segments;
  const isMap = container instanceof Map;

  // Wildcard: every own value of this Map / object.
  if (head === "*") {
    let changed = false;
    const keys = isMap ? Array.from(container.keys()) : Object.keys(container);
    for (const key of keys) {
      const current = isMap ? container.get(key) : container[key];
      if (rest.length === 0) {
        const next = fn(current);
        if (next !== undefined && next !== current) {
          if (isMap) container.set(key, next);
          else container[key] = next;
          changed = true;
        }
      } else if (walkPath(current, rest, fn)) {
        changed = true;
      }
    }
    return changed;
  }

  const current = isMap ? container.get(head) : container[head];

  if (rest.length === 0) {
    const next = fn(current);
    if (next === undefined || next === current) return false;
    if (isMap) container.set(head, next);
    else container[head] = next;
    return true;
  }

  return walkPath(current, rest, fn);
};

/**
 * Match a concrete update key against a configured path pattern.
 *
 * Concrete keys may carry array indices the pattern omits ("messages.0.content"
 * against "messages.content"), and may stop short of the pattern when a whole
 * subtree is replaced at once ("socialLinks" against "socialLinks.instagram").
 *
 * @returns null for no match, or { rest } — the pattern segments still to apply
 *          inside the value at that key ([] means the key is itself the leaf).
 */
const matchKeyToPattern = (keySegments, patternSegments) => {
  let i = 0;
  let j = 0;

  while (i < keySegments.length && j < patternSegments.length) {
    const keySegment = keySegments[i];
    const patternSegment = patternSegments[j];

    if (patternSegment === "*" || patternSegment === keySegment) {
      i += 1;
      j += 1;
      continue;
    }

    // An array index the pattern does not mention.
    if (isDigits(keySegment)) {
      i += 1;
      continue;
    }

    return null;
  }

  if (i < keySegments.length) return null; // key went deeper than the pattern
  return { rest: patternSegments.slice(j) };
};

const normalizeOptions = (options) => {
  const modelName = options.modelName || "Model";

  const encryptSpecs = (options.encrypt || []).map((pattern) => ({
    pattern,
    segments: pattern.split("."),
    json: false,
  }));
  const jsonSpecs = (options.json || []).map((pattern) => ({
    pattern,
    segments: pattern.split("."),
    json: true,
  }));

  const blindIndexes = Object.entries(options.blindIndex || {}).map(
    ([path, indexField]) => ({
      path,
      indexField,
      purpose: `${modelName}.${path}`,
    }),
  );

  const hashes = (options.hash || []).map((path) => ({
    path,
    segments: path.split("."),
    purpose: `${modelName}.${path}`,
  }));

  const encryptAll = [...encryptSpecs, ...jsonSpecs];

  // A blind index exists so that an *encrypted* field is still queryable, so it
  // implies encryption. Deriving it here rather than making callers repeat the
  // path in both lists removes the chance of listing one and forgetting the
  // other, which would silently leave the field in cleartext.
  for (const { path } of blindIndexes) {
    if (encryptAll.some((spec) => spec.pattern === path)) continue;
    encryptAll.push({ pattern: path, segments: path.split("."), json: false });
  }

  return { modelName, encryptAll, blindIndexes, hashes };
};

const encodeForStorage = (spec) => (value) => {
  if (isEmpty(value)) return undefined;
  if (isEncrypted(value)) return undefined; // already ciphertext
  if (spec.json) {
    return encryptValue(
      typeof value === "string" ? value : JSON.stringify(value),
    );
  }
  if (!isPlainValue(value)) return undefined; // never encrypt a structure blindly
  return encryptValue(value);
};

const decodeForUse = (spec) => (value) => {
  if (!isEncrypted(value)) return undefined;
  const plaintext = decryptValue(value);
  if (!spec.json) return plaintext;
  try {
    return JSON.parse(plaintext);
  } catch {
    return plaintext;
  }
};

const digestOnce = (value, purpose) => {
  if (isEmpty(value)) return undefined;
  // A stored digest is 64 hex chars — never hash a hash.
  if (typeof value === "string" && HEX_64.test(value)) return undefined;
  return hashValue(value, purpose);
};

/**
 * Rewrite an equality filter so it targets blind-index / hash companions rather
 * than the encrypted field, which randomized encryption makes unmatchable.
 *
 * Dual-read clauses go into `$and` rather than `$or` so that two translated
 * fields in one filter cannot collide on the same key.
 */
const rewriteFilter = (filter, config) => {
  if (!filter || typeof filter !== "object") return filter;

  const extraAndClauses = [];

  const rewriteNode = (node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return node;

    for (const logicalOperator of ["$or", "$and", "$nor"]) {
      if (Array.isArray(node[logicalOperator])) {
        node[logicalOperator] = node[logicalOperator].map((child) =>
          rewriteFilter(child, config),
        );
      }
    }

    for (const { path, indexField, purpose } of config.blindIndexes) {
      if (!(path in node)) continue;
      const value = node[path];

      if (isPlainValue(value)) {
        delete node[path];
        const digest = blindIndex(value, purpose);
        if (digest === undefined) {
          node[path] = value; // null / empty: nothing to translate
        } else if (DUAL_READ) {
          extraAndClauses.push({
            $or: [{ [indexField]: digest }, { [path]: value }],
          });
        } else {
          node[indexField] = digest;
        }
        continue;
      }

      if (value && Array.isArray(value.$in)) {
        const originals = value.$in;
        delete node[path];
        const digests = originals.map((entry) => blindIndex(entry, purpose));
        if (DUAL_READ) {
          extraAndClauses.push({
            $or: [
              { [indexField]: { $in: digests } },
              { [path]: { $in: originals } },
            ],
          });
        } else {
          node[indexField] = { $in: digests };
        }
        continue;
      }

      console.warn(
        `[ENCRYPTION] ${config.modelName}: cannot translate a non-equality filter on encrypted path "${path}". ` +
          "Substring, range and sort operators do not work over encrypted fields.",
      );
    }

    for (const { path, purpose } of config.hashes) {
      if (!(path in node)) continue;
      const value = node[path];
      if (!isPlainValue(value) || isEmpty(value)) continue;

      const digest = hashValue(value, purpose);
      if (DUAL_READ) {
        delete node[path];
        extraAndClauses.push({ $or: [{ [path]: digest }, { [path]: value }] });
      } else {
        node[path] = digest;
      }
    }

    // Encrypted-but-not-indexed paths can never match by equality. Say so
    // loudly rather than returning a confusing empty result.
    for (const { pattern } of config.encryptAll) {
      if (
        pattern in node &&
        !config.blindIndexes.some((entry) => entry.path === pattern)
      ) {
        console.warn(
          `[ENCRYPTION] ${config.modelName}: filter references encrypted path "${pattern}", which has no blind index. ` +
            "This query cannot match. Add a blind index, or filter on something else.",
        );
      }
    }

    return node;
  };

  const rewritten = rewriteNode(filter);

  if (extraAndClauses.length > 0) {
    const existingAnd = Array.isArray(rewritten.$and) ? rewritten.$and : [];
    rewritten.$and = [...existingAnd, ...extraAndClauses];
  }

  return rewritten;
};

/**
 * Blind indexes are computed from plaintext, so they must be collected before
 * the encryption pass overwrites the values.
 */
const collectBlindIndexes = (payload, config) => {
  const indexes = {};
  if (!payload || typeof payload !== "object") return indexes;

  for (const { path, indexField, purpose } of config.blindIndexes) {
    if (!(path in payload)) continue;
    const raw = payload[path];
    if (isPlainValue(raw) && !isEncrypted(raw)) {
      const digest = blindIndex(raw, purpose);
      if (digest !== undefined) indexes[indexField] = digest;
    }
  }
  return indexes;
};

/** Encrypt / hash the values inside an update operator payload, in place. */
const encodeUpdatePayload = (payload, config) => {
  if (!payload || typeof payload !== "object") return;

  for (const key of Object.keys(payload)) {
    if (key.startsWith("$")) continue;
    const keySegments = key.split(".");

    // Every matching spec is applied, not just the first: replacing the whole
    // `socialLinks` subtree in one $set has to encrypt instagram, twitter and
    // portfolio. Re-encrypting is a no-op, so overlapping specs are harmless.
    for (const spec of config.encryptAll) {
      const match = matchKeyToPattern(keySegments, spec.segments);
      if (!match) continue;

      if (match.rest.length === 0) {
        const next = encodeForStorage(spec)(payload[key]);
        if (next !== undefined) payload[key] = next;
      } else {
        walkPath(payload[key], match.rest, encodeForStorage(spec));
      }
    }

    for (const { path, purpose } of config.hashes) {
      if (key !== path) continue;
      const digest = digestOnce(payload[key], purpose);
      if (digest !== undefined) payload[key] = digest;
    }
  }
};

export default function fieldEncryption(schema, options = {}) {
  const config = normalizeOptions(options);

  if (!ENCRYPTION_ENABLED) {
    // Hashing is not encryption and stays on regardless: an OTP should never be
    // readable in the database, even with field encryption switched off.
    config.encryptAll = [];
    config.blindIndexes = [];
  }

  if (config.encryptAll.length === 0 && config.hashes.length === 0) return;

  // ---- writes: documents -------------------------------------------------

  schema.pre("save", function encryptOnSave(next) {
    try {
      // Blind indexes first, while the values are still plaintext.
      for (const { path, indexField, purpose } of config.blindIndexes) {
        const current = this.get(path);
        const plaintext = isEncrypted(current)
          ? decryptValue(current)
          : current;
        const digest = blindIndex(plaintext, purpose);
        if (this.get(indexField) !== digest) this.set(indexField, digest);
      }

      for (const spec of config.encryptAll) {
        if (walkPath(this, spec.segments, encodeForStorage(spec))) {
          this.markModified(spec.segments[0]);
        }
      }

      for (const { segments, purpose } of config.hashes) {
        if (walkPath(this, segments, (value) => digestOnce(value, purpose))) {
          this.markModified(segments[0]);
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  });

  // Hand plaintext back, so response bodies and post-save reads look exactly as
  // they did before encryption existed.
  schema.post("save", function decryptAfterSave(doc) {
    try {
      for (const spec of config.encryptAll) {
        if (walkPath(doc, spec.segments, decodeForUse(spec))) {
          doc.unmarkModified(spec.segments[0]);
        }
      }
    } catch (error) {
      console.error(
        `[ENCRYPTION] ${config.modelName}: failed to decrypt after save:`,
        error.message,
      );
    }
  });

  schema.pre("insertMany", function encryptOnInsertMany(next, docs) {
    try {
      if (!Array.isArray(docs)) return next();
      for (const doc of docs) {
        Object.assign(doc, collectBlindIndexes(doc, config));
        for (const spec of config.encryptAll) {
          walkPath(doc, spec.segments, encodeForStorage(spec));
        }
        for (const { segments, purpose } of config.hashes) {
          walkPath(doc, segments, (value) => digestOnce(value, purpose));
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  // ---- writes: queries ---------------------------------------------------

  for (const hook of WRITE_QUERY_HOOKS) {
    schema.pre(hook, QUERY_MIDDLEWARE, function encryptOnUpdate(next) {
      try {
        const update = this.getUpdate();
        if (!update || typeof update !== "object") return next();

        // Bare fields and operators can coexist: mongoose adds
        // `$setOnInsert: { __v: 0 }` to an otherwise plain replacement document
        // and folds the bare keys into `$set` at cast time. So each bucket is
        // handled on its own rather than treating the document as either/or.
        //
        // Blind indexes are collected before encryption, while the values are
        // still plaintext, and are written back into the same bucket they came
        // from — an index derived from a `$setOnInsert` value must not be
        // applied by `$set` on an update that never touched the field.
        const bareIndexes = collectBlindIndexes(update, config);
        const setIndexes = collectBlindIndexes(update.$set, config);
        const insertIndexes = collectBlindIndexes(update.$setOnInsert, config);

        for (const operator of ["$set", "$setOnInsert"]) {
          if (update[operator]) encodeUpdatePayload(update[operator], config);
        }

        // Subdocuments pushed into an encrypted array.
        for (const operator of ["$push", "$addToSet"]) {
          const payload = update[operator];
          if (!payload) continue;

          for (const arrayPath of Object.keys(payload)) {
            const specs = config.encryptAll.filter(
              (spec) =>
                spec.segments[0] === arrayPath && spec.segments.length > 1,
            );
            if (specs.length === 0) continue;

            const entry = payload[arrayPath];
            const items =
              entry && typeof entry === "object" && Array.isArray(entry.$each)
                ? entry.$each
                : [entry];

            for (const item of items) {
              for (const spec of specs) {
                walkPath(item, spec.segments.slice(1), encodeForStorage(spec));
              }
            }
          }
        }

        // Skips $-prefixed keys internally, so this only touches bare fields.
        encodeUpdatePayload(update, config);

        Object.assign(update, bareIndexes);
        if (Object.keys(setIndexes).length > 0) {
          update.$set = { ...(update.$set || {}), ...setIndexes };
        }
        if (Object.keys(insertIndexes).length > 0) {
          update.$setOnInsert = { ...(update.$setOnInsert || {}), ...insertIndexes };
        }
        this.setUpdate(update);

        next();
      } catch (error) {
        next(error);
      }
    });
  }

  // ---- filters -----------------------------------------------------------

  for (const hook of FILTER_QUERY_HOOKS) {
    schema.pre(hook, QUERY_MIDDLEWARE, function rewriteQueryFilter(next) {
      try {
        const filter = this.getFilter();
        if (filter && typeof filter === "object") {
          this.setQuery(rewriteFilter(filter, config));
        }
        next();
      } catch (error) {
        next(error);
      }
    });
  }

  // ---- reads -------------------------------------------------------------

  schema.post("init", function decryptOnInit() {
    try {
      for (const spec of config.encryptAll) {
        if (walkPath(this, spec.segments, decodeForUse(spec))) {
          // Decrypting is not a user edit; do not let it trigger a rewrite.
          this.unmarkModified(spec.segments[0]);
        }
      }
    } catch (error) {
      // Failing loud on purpose: a bad auth tag means the data was tampered
      // with, and returning garbage would hide that.
      console.error(
        `[ENCRYPTION] ${config.modelName}: failed to decrypt document ${this?._id}:`,
        error.message,
      );
      throw error;
    }
  });

  // .lean() skips init entirely, so decrypt the raw objects here.
  for (const hook of READ_QUERY_HOOKS) {
    schema.post(hook, QUERY_MIDDLEWARE, function decryptLeanResult(result) {
      if (!result) return;
      if (!this._mongooseOptions?.lean) return;

      const documents = Array.isArray(result) ? result : [result];
      for (const document of documents) {
        for (const spec of config.encryptAll) {
          walkPath(document, spec.segments, decodeForUse(spec));
        }
      }
    });
  }
}

export { walkPath, matchKeyToPattern, rewriteFilter, normalizeOptions };
