import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { verifyAccessToken } from "../utils/token";

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  const [scheme, token] = req.header("authorization")?.split(" ") ?? [];
  if (scheme !== "Bearer" || !token) return next(new AppError(401, "UNAUTHORIZED", "Authentication required"));

  try {
    const claims = verifyAccessToken(token);
    if (!claims.sub || !claims.email || !claims.sid) throw new Error("Missing claims");
    req.user = { id: claims.sub, email: claims.email, sessionId: claims.sid };
    next();
  } catch {
    next(new AppError(401, "UNAUTHORIZED", "Access token is invalid or expired"));
  }
};

