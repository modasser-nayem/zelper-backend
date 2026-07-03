import { ZodSchema } from "zod";
import catchAsync from "../../shared/catchAsync";

const validateRequest = (schema: ZodSchema) => {
  return catchAsync(async (req, _res, next) => {
    const result = await schema.parseAsync(req.body);
    req.body = result;
    next();
  });
};

export default validateRequest;
