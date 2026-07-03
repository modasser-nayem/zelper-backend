import httpStatus from "http-status";
import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { JsonWebTokenError } from "jsonwebtoken";
import zodErrorHandler from "../../errors/zodErrorHandler";

import AppError from "../../errors/AppError";
import config from "../../config";
import { Prisma } from "@prisma/client";
import parsePrismaValidationError from "../../errors/parsePrismaValidationError";

export const globalErrorHandler: ErrorRequestHandler = (
  err,
  _req,
  res,
  _next,
) => {
  let message = err.message || "Something went wrong!";
  let statusCode = err.statusCode || httpStatus.INTERNAL_SERVER_ERROR;
  let errors = [];
  let stack = err.stack || null;

  if (err instanceof ZodError) {
    const result = zodErrorHandler(err);
    statusCode = result.statusCode;
    message = result.message;
    errors = result.error;
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = [{ type: "ApiError", message: err.message }];
  } else if (err instanceof JsonWebTokenError) {
    statusCode = httpStatus.UNAUTHORIZED;
    message = "Unauthorized Access";
    errors = [{ type: "ApiError", details: err.message }];
    stack = err.stack;
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    message = parsePrismaValidationError(err.message);
    errors.push({
      type: "PrismaError",
      message: "Prisma Client Validation Error",
    });
  } else if (err instanceof Prisma.PrismaClientInitializationError) {
    message =
      "Failed to initialize Prisma Client. Check your database connection or Prisma configuration.";
    errors.push({
      type: "PrismaError",
      message: "Prisma Client Initialization Error",
    });
  } else if (err instanceof Prisma.PrismaClientRustPanicError) {
    message =
      "A critical error occurred in the Prisma engine. Please try again later.";
    errors.push({
      type: "PrismaError",
      message: "Prisma Client Rust Panic Error",
    });
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    message = "A known error occurred while processing the request.";
    errors.push({
      type: "PrismaError",
      message: "Prisma Client known Request Error",
    });
  } else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    message = "An unknown error occurred while processing the request.";
    errors.push({
      type: "PrismaError",
      message: "Prisma Client Unknown Request Error",
    });

    // Generic Error Handling (e.g., JavaScript Errors)
  } else if (err instanceof SyntaxError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = "Syntax error in the request. Please verify your input.";
    errors.push({
      type: "SyntaxError",
      message,
    });
  } else if (err instanceof TypeError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = "Type error in the application. Please verify your input.";
    errors.push({
      type: "TypeError",
      message,
    });
  } else if (err instanceof ReferenceError) {
    statusCode = httpStatus.BAD_REQUEST;
    message = "Reference error in the application. Please verify your input.";
    errors.push({
      type: "ReferenceError",
      message,
    });
  } else if (err instanceof Error) {
    if (err.message) {
      message = err.message;
      // Catch any other error type
    } else {
      message = "An unexpected error occurred!";
      errors.push({
        type: "UnknownError",
        message,
      });
    }
  }

  // if (config.NODE_ENV === "development") {
  //   logger.error(`${statusCode} - ${message}`, { stack });
  // }

  res.status(statusCode).json({
    success: false,
    message: message,
    errors: errors,
    stack: config.NODE_ENV === "development" ? stack : null,
  });
};
