import config from "../config";
import * as bcrypt from "bcrypt";

const hashedPassword = async (plainTextPass: string) => {
  return await bcrypt.hash(plainTextPass, Number(config.BCRYPT_SALT_ROUNDS));
};

const isPasswordMatch = async (
  plainTextPassword: string,
  hashPassword: string,
): Promise<boolean> => {
  return await bcrypt.compare(plainTextPassword, hashPassword);
};

export const PasswordHelper = {
  hashedPassword,
  isPasswordMatch,
};
