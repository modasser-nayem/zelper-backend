import z from "zod";
import { AuthValidation } from "./auth.validation";

export type TSignupUser = z.infer<typeof AuthValidation.signup>;
export type TLogin = z.infer<typeof AuthValidation.login>;
export type TSocialLogin = z.infer<typeof AuthValidation.socialLogin>;

export type TChangePassword = z.infer<typeof AuthValidation.changePassword> & {
  userId: string;
};
export type TForgotPassword = z.infer<typeof AuthValidation.forgotPassword>;
export type TResetPassword = z.infer<typeof AuthValidation.resetPassword>;

export type TSendOtp = z.infer<typeof AuthValidation.sendOtp>;
export type TVerifyOtp = z.infer<typeof AuthValidation.verifyOtp>;
