import { ZodError } from "zod";

const zodErrorHandler = (
  err: ZodError,
): {
  statusCode: number;
  message: string;
  error: { path: string | number; message: string }[];
} => {
  const message = err.issues[0].message;
  const error = err.issues.map((issue) => ({
    path: issue.path[issue.path.length - 1],
    message: issue.message,
  }));
  return {
    statusCode: 400,
    message: "ValidationError",
    error: error,
  };
};

export default zodErrorHandler;
