import config from "../../../config";

//  Utility: generate OTP
export const generateOtp = () => {
  const otp = Math.floor(100000 + Math.random() * 900000);
  const expireMinute = Number(config.OTP_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + expireMinute * 60 * 1000); // 10 min
  return { otp, expiresAt, expireMinute };
};
