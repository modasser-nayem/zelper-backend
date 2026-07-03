/* eslint-disable @typescript-eslint/no-explicit-any */
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import config from "../config";

export type ITokenType = "ACCESS_TOKEN" | "REFRESH_TOKEN";

interface TokenConfig {
  secret: string;
  expiresIn: SignOptions["expiresIn"]; // number | string | undefined
}

class JwtHelper {
  // Central token configuration
  private static tokenMap: Record<ITokenType, TokenConfig> = {
    ACCESS_TOKEN: {
      secret: config.token.ACCESS_TOKEN_SECRET,
      expiresIn: config.token.ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
    },
    REFRESH_TOKEN: {
      secret: config.token.REFRESH_TOKEN_SECRET,
      expiresIn: config.token.REFRESH_EXPIRES_IN as SignOptions["expiresIn"],
    },
  };

  private static signOptions(expiresIn: SignOptions["expiresIn"]): SignOptions {
    return {
      algorithm: "HS256",
      expiresIn,
    };
  }

  // Generic token generator
  static generateToken<T extends object>(payload: T, type: ITokenType): string {
    const tokenConfig = this.tokenMap[type];
    return jwt.sign(
      payload,
      tokenConfig.secret,
      this.signOptions(tokenConfig.expiresIn),
    );
  }

  // Safe token verification
  static verifyToken<T = JwtPayload>(token: string, type: ITokenType): T {
    try {
      const tokenConfig = this.tokenMap[type];
      return jwt.verify(token, tokenConfig.secret) as T;
    } catch (error) {
      throw new Error("Invalid or expired token");
    }
  }
}

export default JwtHelper;
