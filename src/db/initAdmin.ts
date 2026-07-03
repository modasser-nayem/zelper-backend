import { UserRole } from "@prisma/client";
import config from "../config";
import prisma from "./prisma";
import { PasswordHelper } from "../helpers/password";

export const initiateAdmin = async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = {
    name: "Admin",
    email: config.admin.ADMIN_DEFAULT_EMAIL,
    role: UserRole.ADMIN,
  };

  const hashedPassword = await PasswordHelper.hashedPassword(
    config.admin.ADMIN_DEFAULT_PASSWORD,
  );

  const isExistUser = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });

  if (isExistUser) return;

  await prisma.user.create({
    data: { ...payload, password: hashedPassword },
  });
};
