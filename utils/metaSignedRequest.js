import crypto from "crypto";

/**
 * Verification for Meta's `signed_request`, the payload used by the Deauthorize
 * and Data Deletion Request callbacks.
 *
 * These endpoints are unauthenticated by design — Meta's servers call them with
 * no bearer token — so the HMAC is the *only* thing separating a real callback
 * from anyone on the internet POSTing an app-scoped id and having us delete that
 * account. Treat a verification failure as hostile, not as a bug.
 *
 * Format: `<base64url signature>.<base64url payload>`, where the signature is
 * HMAC-SHA256 over the payload **as the base64 string it arrived as**, keyed on
 * the app secret. Decoding first and hashing the JSON would not match.
 */

const base64UrlToBuffer = (input) =>
  Buffer.from(String(input).replace(/-/g, "+").replace(/_/g, "/"), "base64");

export const parseSignedRequest = (signedRequest, appSecret) => {
  if (!appSecret) {
    throw new Error(
      "INSTAGRAM_APP_SECRET is not configured; cannot verify signed_request.",
    );
  }

  if (typeof signedRequest !== "string" || !signedRequest.includes(".")) {
    throw new Error("Malformed signed_request.");
  }

  const separator = signedRequest.indexOf(".");
  const signatureB64 = signedRequest.slice(0, separator);
  const payloadB64 = signedRequest.slice(separator + 1);

  if (!signatureB64 || !payloadB64) {
    throw new Error("Malformed signed_request.");
  }

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(payloadB64)
    .digest();
  const provided = base64UrlToBuffer(signatureB64);

  // timingSafeEqual throws on a length mismatch, so check that first.
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    throw new Error("signed_request signature mismatch.");
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlToBuffer(payloadB64).toString("utf8"));
  } catch {
    throw new Error("signed_request payload is not valid JSON.");
  }

  // Guards against a downgrade to a weaker algorithm we do not implement.
  if (String(payload.algorithm).toUpperCase() !== "HMAC-SHA256") {
    throw new Error(
      `Unsupported signed_request algorithm: ${payload.algorithm}`,
    );
  }

  return payload;
};

export default parseSignedRequest;
