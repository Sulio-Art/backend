import jwt from "jsonwebtoken";

/**
 * Populates `req.user` when a valid bearer token is present, and does nothing
 * when it is absent or invalid.
 *
 * Needed by `GET /instagram/auth-url`, which serves both an anonymous visitor
 * signing in with Instagram and a signed-in user connecting an account. The
 * connect case has to bind the OAuth nonce to a user id; the login case has no
 * user yet. `protect` cannot express that, and duplicating the route would mean
 * two places to keep in step.
 *
 * This deliberately never rejects — it only reports. Any handler that requires a
 * user must still check for `req.user` itself.
 */
const optionalProtect = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) return next();

  try {
    const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    if (decoded?.id) req.user = { id: decoded.id };
  } catch {
    // An expired or forged token is treated as "not signed in". The handler
    // decides whether that is acceptable for the request it is serving.
  }

  return next();
};

export default optionalProtect;
