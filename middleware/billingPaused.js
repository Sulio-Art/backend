/**
 * Kill switch for plan changes and paid upgrades.
 *
 * Plan mutation and payment capture are currently unsafe: the plan-change
 * endpoints let a caller set their own `plan`/`status`, and PayPal capture does
 * not verify the order belongs to the caller. Until those flows are rebuilt
 * around verified provider webhooks, they stay off.
 *
 * Set BILLING_ENABLED=true to re-enable once the flows are fixed.
 */

export const BILLING_ENABLED =
  String(process.env.BILLING_ENABLED || "false").trim().toLowerCase() ===
  "true";

const billingPaused = (req, res, next) => {
  if (BILLING_ENABLED) return next();

  return res.status(503).json({
    message:
      "Plan changes and upgrades are temporarily unavailable. Your current plan is unaffected.",
    code: "BILLING_PAUSED",
  });
};

if (!BILLING_ENABLED) {
  console.log(
    "[BILLING] Plan changes and upgrade endpoints are PAUSED (BILLING_ENABLED is not true).",
  );
}

export default billingPaused;
