import { Response } from "express";

type TSendResponseData = {
  statusCode: number;
  success?: boolean;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const sendResponse = (res: Response, data: TSendResponseData) => {
  res.status(data.statusCode).json({
    success: data.success || true,
    message: data.message,
    data: data.data,
    meta: data?.meta,
  });
};

export default sendResponse;
