/**
 * Application-level encryption primitives.
 *
 * Why this exists: Atlas encrypts at rest, but it decrypts transparently for
 * anyone holding the connection string. These primitives make a leaked
 * connection string useless on its own — the ciphertext is only readable with a
 * key that lives in the secret manager, never in the database.
 *
 * Two schemes:
 *   - encryptValue / decryptValue — AES-256-GCM, random IV per value. Not
 *     queryable. Use for anything you only ever read back.
 *   - blindIndex — HMAC-SHA256, deterministic. Queryable by equality. Use as a
 *     companion field for anything you need to look up.
 *
 * Ciphertext format (versioned so keys can rotate without a flag day):
 *
 *   enc:v1:<keyId>:<iv b64>:<authTag b64>:<ciphertext b64>
 *
 * decryptValue() passes anything without that prefix through untouched, so a
 * half-migrated collection reads correctly during a rolling backfill.
 */

import crypto from "crypto";

const PREFIX = "enc";
const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const KEY_BYTES = 32;

export const ENCRYPTION_ENABLED =
  String(process.env.ENCRYPTION_ENABLED ?? "true").trim().toLowerCase() !==
  "false";

/**
 * During a rolling backfill, equality lookups must match both migrated rows
 * (via blind index) and legacy rows (via plaintext). Turn this off once the
 * backfill is verified complete — it stops the legacy plaintext branch from
 * being queryable at all.
 */
export const DUAL_READ =
  String(process.env.ENCRYPTION_DUAL_READ ?? "true").trim().toLowerCase() !==
  "false";

const decodeKey = (name, raw) => {
  const key = Buffer.from(String(raw).trim(), "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `${name} must be ${KEY_BYTES} bytes base64-encoded (got ${key.length}). ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return key;
};

/**
 * Keyring. The active key encrypts; retired keys stay loaded so old ciphertext
 * still decrypts while a re-encryption job works through the backlog.
 *
 *   DATA_ENCRYPTION_KEY          active key, base64
 *   DATA_ENCRYPTION_KEY_ID       label for the active key, default "k1"
 *   DATA_ENCRYPTION_KEYS_RETIRED optional "id:base64,id:base64"
 */
const buildKeyring = () => {
  const ring = new Map();

  if (process.env.DATA_ENCRYPTION_KEYS_RETIRED) {
    for (const entry of process.env.DATA_ENCRYPTION_KEYS_RETIRED.split(",")) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const separator = trimmed.indexOf(":");
      if (separator === -1) {
        throw new Error(
          "DATA_ENCRYPTION_KEYS_RETIRED entries must look like 'keyId:base64key'.",
        );
      }
      const id = trimmed.slice(0, separator).trim();
      ring.set(id, decodeKey(`DATA_ENCRYPTION_KEYS_RETIRED[${id}]`, trimmed.slice(separator + 1)));
    }
  }

  const activeId = (process.env.DATA_ENCRYPTION_KEY_ID || "k1").trim();
  if (process.env.DATA_ENCRYPTION_KEY) {
    ring.set(activeId, decodeKey("DATA_ENCRYPTION_KEY", process.env.DATA_ENCRYPTION_KEY));
  }

  return { ring, activeId };
};

let keyring = null;
let blindIndexKey = null;

const getKeyring = () => {
  if (!keyring) keyring = buildKeyring();
  return keyring;
};

const getBlindIndexKey = () => {
  if (!blindIndexKey) {
    if (!process.env.BLIND_INDEX_KEY) {
      throw new Error(
        "BLIND_INDEX_KEY is not set. Encrypted lookups cannot work without it.",
      );
    }
    blindIndexKey = decodeKey("BLIND_INDEX_KEY", process.env.BLIND_INDEX_KEY);
  }
  return blindIndexKey;
};

/**
 * Derive a purpose-specific HMAC key from the blind-index root key.
 *
 * Domain separation matters here: without it, the blind index of an email could
 * be replayed as the hash of an OTP. Distinct `purpose` strings make the two
 * keyspaces unrelated.
 */
const derivedKeys = new Map();
const deriveHmacKey = (purpose) => {
  if (!derivedKeys.has(purpose)) {
    const derived = crypto.hkdfSync(
      "sha256",
      getBlindIndexKey(),
      Buffer.from("sulio-blind-index-v1"),
      Buffer.from(purpose),
      KEY_BYTES,
    );
    derivedKeys.set(purpose, Buffer.from(derived));
  }
  return derivedKeys.get(purpose);
};

/** @returns {boolean} true if the value is one of our ciphertext envelopes */
export const isEncrypted = (value) =>
  typeof value === "string" && value.startsWith(`${PREFIX}:${VERSION}:`);

/**
 * Encrypt a string with the active key.
 * Values that are already encrypted are returned untouched, so this is safe to
 * call twice on the same document.
 */
export const encryptValue = (plaintext) => {
  if (!ENCRYPTION_ENABLED) return plaintext;
  if (plaintext === null || plaintext === undefined) return plaintext;
  if (isEncrypted(plaintext)) return plaintext;

  const asString = typeof plaintext === "string" ? plaintext : String(plaintext);
  if (asString === "") return asString;

  const { ring, activeId } = getKeyring();
  const key = ring.get(activeId);
  if (!key) {
    throw new Error(
      `DATA_ENCRYPTION_KEY is not set (active key id "${activeId}"). ` +
        "Set it, or set ENCRYPTION_ENABLED=false to run without encryption.",
    );
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(asString, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    PREFIX,
    VERSION,
    activeId,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
};

/**
 * Decrypt one of our envelopes. Anything else is returned as-is — that is what
 * makes a half-migrated collection readable.
 *
 * Throws on a malformed or tampered envelope rather than returning garbage: a
 * failed auth tag means the data was modified, and silently swallowing that
 * would hide an attack.
 */
export const decryptValue = (value) => {
  if (!isEncrypted(value)) return value;

  const parts = value.split(":");
  if (parts.length !== 6) {
    throw new Error("Malformed ciphertext envelope: wrong number of segments.");
  }

  const [, version, keyId, ivB64, tagB64, dataB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Unsupported ciphertext version "${version}".`);
  }

  const { ring } = getKeyring();
  const key = ring.get(keyId);
  if (!key) {
    throw new Error(
      `No key available for keyId "${keyId}". ` +
        "Add it to DATA_ENCRYPTION_KEYS_RETIRED to read data encrypted with a rotated key.",
    );
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

/**
 * Deterministic, queryable digest of a value.
 *
 * Known and accepted leak: equal plaintexts produce equal digests, so someone
 * with database access can tell that two rows share a value and can confirm a
 * guessed value. That is the unavoidable cost of equality lookups over
 * encrypted data.
 *
 * @param value    the plaintext to index
 * @param purpose  domain-separation label, e.g. "User.email"
 */
export const blindIndex = (value, purpose = "default") => {
  if (value === null || value === undefined || value === "") return value;
  const normalized = String(value).trim().toLowerCase();
  return crypto
    .createHmac("sha256", deriveHmacKey(`blind-index:${purpose}`))
    .update(normalized)
    .digest("hex");
};

/**
 * One-way digest for values that never need reading back — OTPs, for instance.
 * Case is preserved (unlike blindIndex) because these are exact-match secrets.
 */
export const hashValue = (value, purpose = "default") => {
  if (value === null || value === undefined || value === "") return value;
  return crypto
    .createHmac("sha256", deriveHmacKey(`hash:${purpose}`))
    .update(String(value).trim())
    .digest("hex");
};

/** Constant-time comparison for digests produced by hashValue(). */
export const hashMatches = (plaintext, storedHash, purpose = "default") => {
  if (!storedHash) return false;
  const candidate = hashValue(plaintext, purpose);
  if (typeof candidate !== "string") return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(String(storedHash));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

/** Fail fast at boot rather than at the first write. */
export const assertEncryptionConfigured = () => {
  if (!ENCRYPTION_ENABLED) {
    console.warn(
      "[ENCRYPTION] DISABLED (ENCRYPTION_ENABLED=false). Field data will be stored in cleartext.",
    );
    return;
  }

  const { ring, activeId } = getKeyring();
  if (!ring.get(activeId)) {
    throw new Error(
      "ENCRYPTION_ENABLED is on but DATA_ENCRYPTION_KEY is not set. Refusing to start.",
    );
  }
  getBlindIndexKey();

  console.log(
    `[ENCRYPTION] Active (key "${activeId}", ${ring.size} key(s) loaded, dualRead=${DUAL_READ}).`,
  );
};

export default {
  ENCRYPTION_ENABLED,
  DUAL_READ,
  isEncrypted,
  encryptValue,
  decryptValue,
  blindIndex,
  hashValue,
  hashMatches,
  assertEncryptionConfigured,
};
