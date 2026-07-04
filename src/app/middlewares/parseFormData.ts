import { Request, Response, NextFunction } from "express";

export const parseFormData = (req: Request, res: Response, next: NextFunction) => {
  if (req.body && typeof req.body.data === "string") {
    try {
      req.body = JSON.parse(req.body.data);
    } catch (error) {
      // Let validation schema trigger error if JSON is malformed
    }
  }
  next();
};
