import { Response } from "express";

export const COOKIE_NAME = {
  ACCESS_TOKEN: "accessToken",
  REFRESH_TOKEN: "refreshToken",
};

type TSetCookie = {
  res: Response;
  cookieName: string;
  token: string;
  maxAge?: number;
};

type TClearCookie = {
  res: Response;
  cookieName: string;
};

const defaultTokenAge = 120; // 120 days

export const setCookie = ({
  res,
  cookieName,
  token,
  maxAge = defaultTokenAge,
}: TSetCookie) => {
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: maxAge * 24 * 60 * 60 * 1000,
  });
};

export const clearCookie = ({ res, cookieName }: TClearCookie) => {
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
  });
};
