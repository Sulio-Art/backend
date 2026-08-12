/**
 * Development-only OTP bypass.
 *
 * The bypass code is never hardcoded — it comes from SUPER_OTP in the
 * environment, and it is only honoured when APP_MODE is a development mode.
 * In any other mode isSuperOtp() always returns false, so a leaked code is
 * useless against production.
 */

const APP_MODE = (process.env.APP_MODE || process.env.NODE_ENV || "prod")
  .trim()
  .toLowerCase();

const DEV_MODES = ["dev", "development", "local", "test"];

export const IS_DEV_MODE = DEV_MODES.includes(APP_MODE);

const SUPER_OTP = (process.env.SUPER_OTP || "").trim();

export const SUPER_OTP_ENABLED = IS_DEV_MODE && SUPER_OTP.length > 0;

/**
 * @param   {unknown} otp  the OTP supplied by the client
 * @returns {boolean}      true only in dev mode, with SUPER_OTP configured and matching
 */
export const isSuperOtp = (otp) => {
  if (!SUPER_OTP_ENABLED) return false;
  if (typeof otp !== "string") return false;
  return otp.trim() === SUPER_OTP;
};

if (SUPER_OTP_ENABLED) {
  console.warn(
    `[SECURITY] SUPER_OTP bypass is ACTIVE (APP_MODE=${APP_MODE}). Never run this configuration in production.`,
  );
} else if (SUPER_OTP.length > 0) {
  console.log(
    `[SECURITY] SUPER_OTP is set but ignored because APP_MODE=${APP_MODE} is not a development mode.`,
  );
}
