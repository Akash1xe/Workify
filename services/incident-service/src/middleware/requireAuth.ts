import { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../errors/AppError";

type AccessClaims = jwt.JwtPayload & { sub: string; email: string; sid: string };

export const requireAuth: RequestHandler = (req, _res, next) => {
  const authorization = req.header("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));
  }

  try {
    const claims = jwt.verify(authorization.slice(7), env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE
    }) as AccessClaims;
    if (!claims.sub || typeof claims.email !== "string" || typeof claims.sid !== "string") {
      throw new Error("Invalid access token claims");
    }
    req.user = { id: claims.sub, email: claims.email, sessionId: claims.sid };
    next();
  } catch {
    next(new AppError(401, "UNAUTHORIZED", "Access token is invalid or expired"));
  }
};
