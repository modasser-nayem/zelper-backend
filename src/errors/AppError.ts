class AppError extends Error {
  public statusCode: number;
  public code?: string;
  public data?: any;

  constructor(
    statusCode: number,
    message: string,
    code?: string,
    data?: any,
    stack = "",
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.data = data;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export default AppError;

