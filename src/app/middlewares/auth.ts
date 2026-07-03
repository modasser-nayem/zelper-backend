import { Request, Response, NextFunction } from "express";
import catchAsync from "../../shared/catchAsync";
import { UserRole } from "@prisma/client";
import AppError from "../../errors/AppError";
import JwtHelper from "../../helpers/jwtHelpers";
import status from "http-status";

export const auth = (...roles: UserRole[]) => {
  return catchAsync(
    async (req: Request, _res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new AppError(status.UNAUTHORIZED, "Unauthorized access");
      }

      // Extract the token part after "Bearer "
      const token = authHeader.split(" ")[1];

      const decoded = JwtHelper.verifyToken(token, "ACCESS_TOKEN");
      if (!decoded)
        throw new AppError(status.UNAUTHORIZED, "Invalid access token");

      // Check roles
      if (roles.length && !roles.includes(decoded.role)) {
        throw new AppError(
          403,
          "You don't have permission to access this data!",
        );
      }

      req.user = decoded;
      next();
    },
  );
};
