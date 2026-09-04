import { CookieOptions, Request, RequestHandler } from "express";
import { env } from "../config/env";
import { AppError } from "../errors/AppError";
import { AuthService } from "../services/auth.service";
import { durationToMilliseconds } from "../utils/duration";

const authService = new AuthService();

const cookiePath = (req: Request): string => `${req.header("x-forwarded-prefix") ?? ""}${req.baseUrl}`;

const cookieOptions = (req: Request): CookieOptions => ({
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: "lax",
  path: cookiePath(req),
  maxAge: durationToMilliseconds(env.REFRESH_TOKEN_TTL)
});

const rawRefreshToken = (req: Request): string => {
  const token = req.body?.refreshToken ?? req.cookies?.refreshToken;
  if (!token) throw new AppError(401, "REFRESH_TOKEN_REQUIRED", "Refresh token is required");
  return token;
};

export const register: RequestHandler = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.cookie("refreshToken", result.refreshToken, cookieOptions(req));
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.cookie("refreshToken", result.refreshToken, cookieOptions(req));
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const result = await authService.refresh(rawRefreshToken(req));
    res.cookie("refreshToken", result.refreshToken, cookieOptions(req));
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const logout: RequestHandler = async (req, res, next) => {
  try {
    await authService.logout(rawRefreshToken(req));
    res.clearCookie("refreshToken", cookieOptions(req));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const me: RequestHandler = async (req, res, next) => {
  try {
    res.json({ user: await authService.me(req.user!.id) });
  } catch (error) {
    next(error);
  }
};

export const listSessions: RequestHandler = async (req, res, next) => {
  try {
    res.json({ sessions: await authService.listSessions(req.user!.id, req.user!.sessionId) });
  } catch (error) {
    next(error);
  }
};

export const revokeSession: RequestHandler = async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    if (typeof sessionId !== "string") {
      throw new AppError(400, "INVALID_SESSION_ID", "Session id is invalid");
    }
    await authService.revokeSession(req.user!.id, sessionId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const logoutAll: RequestHandler = async (req, res, next) => {
  try {
    await authService.logoutAll(req.user!.id);
    res.clearCookie("refreshToken", cookieOptions(req));
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
