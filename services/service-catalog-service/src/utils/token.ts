import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessClaims extends JwtPayload {
  sub: string;
  email: string;
  sid: string;
}

export const verifyAccessToken = (token: string): AccessClaims =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE
  }) as AccessClaims;

