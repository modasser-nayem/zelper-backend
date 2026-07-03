import { z } from "zod";
import { userValidationSchema } from "./user.validation";

export type TUpdateUser = z.infer<typeof userValidationSchema.updateUser>;

export type IUserFilterRequest = {
  searchTerm?: string | undefined;
  role?: string;
  status?: string;
};
