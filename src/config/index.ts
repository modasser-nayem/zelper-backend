import dotenv from "dotenv";
import path from "path";
import { envRequireNumber, envRequireString } from "../helpers/envValidate";

const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
dotenv.config({ path: path.join(process.cwd(), envFile) });

export default {
  // General
  NODE_ENV: envRequireString("NODE_ENV"),
  PORT: envRequireNumber("PORT"),
  DATABASE_URL: envRequireString("DATABASE_URL"),
  FRONTEND_URL: envRequireString("FRONTEND_URL"),
  BCRYPT_SALT_ROUNDS: envRequireNumber("BCRYPT_SALT_ROUNDS"),

  // OTP
  OTP_EXPIRES_IN: envRequireNumber("OTP_EXPIRES_IN"),

  // Auth token
  token: {
    ACCESS_TOKEN_SECRET: envRequireString("ACCESS_TOKEN_SECRET"),
    ACCESS_EXPIRES_IN: envRequireString("ACCESS_EXPIRES_IN"),
    REFRESH_TOKEN_SECRET: envRequireString("REFRESH_TOKEN_SECRET"),
    REFRESH_EXPIRES_IN: envRequireString("REFRESH_EXPIRES_IN"),
  },

  // Admin Credentials
  admin: {
    ADMIN_DEFAULT_EMAIL: envRequireString("ADMIN_DEFAULT_EMAIL"),
    ADMIN_DEFAULT_PASSWORD: envRequireString("ADMIN_DEFAULT_PASSWORD"),
  },

  // Auth Provider
  oauth: {
    google: {
      GOOGLE_CLIENT_ID: envRequireString("GOOGLE_CLIENT_ID"),
      GOOGLE_CLIENT_SECRET: envRequireString("GOOGLE_CLIENT_SECRET"),
    },
  },

  // AWS S3 Configuration
  aws: {
    AWS_ACCESS_KEY: envRequireString("AWS_ACCESS_KEY"),
    AWS_SECRET_KEY: envRequireString("AWS_SECRET_KEY"),
    AWS_REGION: envRequireString("AWS_REGION"),
    AWS_S3_BUCKET_NAME: envRequireString("AWS_S3_BUCKET_NAME"),
  },

  // Mail Service
  mail: {
    SMTP_HOST: envRequireString("SMTP_HOST"),
    SMTP_PORT: envRequireNumber("SMTP_PORT"),
    SMTP_USER: envRequireString("SMTP_USER"),
    SMTP_APP_PASS: envRequireString("SMTP_APP_PASS"),
    SMTP_DEFAULT_MAIL: envRequireString("SMTP_DEFAULT_MAIL"),
    SMTP_SUPPORT_MAIL: envRequireString("SMTP_SUPPORT_MAIL"),
  },

  // Stripe
  stripe: {
    STRIPE_SECRET_KEY: envRequireString("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: envRequireString("STRIPE_WEBHOOK_SECRET"),
    PLATFORM_FEE_PERCENT: envRequireNumber("PLATFORM_FEE_PERCENT"),
  },
};
