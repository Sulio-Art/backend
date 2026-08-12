/**
 * Terminal error handler.
 *
 * This used to answer every failure with 500 regardless of what the controller
 * asked for, which made the `res.status(401); throw new Error(...)` pattern used
 * throughout the controllers a no-op — a client could not tell an expired OAuth
 * link from a broken server, and could not tell a duplicate account (409) from a
 * crash. Precedence: an explicit `err.statusCode`, then whatever the controller
 * set on the response, then 500.
 */
const errorHandler = (err, req, res, next) => {
  const fromResponse = res.statusCode >= 400 ? res.statusCode : null;
  const status = err.statusCode || err.status || fromResponse || 500;

  // Server-side faults are worth a stack; a 401 or a 409 is routine and would
  // just bury the real ones.
  if (status >= 500) {
    console.error(err.stack);
  } else {
    console.warn(`[${status}] ${req.method} ${req.originalUrl}: ${err.message}`);
  }

  res.status(status).json({
    error: err.message,
    message: err.message,
    ...(process.env.NODE_ENV === "production"
      ? {}
      : { stack: status >= 500 ? err.stack : undefined }),
  });
};

export default errorHandler;
