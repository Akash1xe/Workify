import { createHash, randomUUID } from "node:crypto";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessClaims extends JwtPayload {
  sub: string;
  email: string;
  sid: string;
}

export interface RefreshClaims extends JwtPayload {
  sub: string;
  sid: string;
  jti: string;
}

const issuer = "sentinelai-auth";
const accessAudience = "sentinelai-api";
const refreshAudience = "sentinelai-refresh";

export const newTokenId = (): string => randomUUID();
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export const signAccessToken = (userId: string, email: string, sessionId: string): string =>
  jwt.sign({ email, sid: sessionId }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    issuer,
    audience: accessAudience,
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"]
  });

export const signRefreshToken = (userId: string, sessionId: string, jti: string): string =>
  jwt.sign({ sid: sessionId }, env.JWT_REFRESH_SECRET, {
    subject: userId,
    jwtid: jti,
    issuer,
    audience: refreshAudience,
    expiresIn: env.REFRESH_TOKEN_TTL as SignOptions["expiresIn"]
  });

export const verifyAccessToken = (token: string): AccessClaims =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer, audience: accessAudience }) as AccessClaims;

export const verifyRefreshToken = (token: string): RefreshClaims =>
  jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer, audience: refreshAudience }) as RefreshClaims;

