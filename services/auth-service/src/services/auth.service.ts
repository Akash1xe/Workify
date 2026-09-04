import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../errors/AppError";
import { SessionRepository } from "../repositories/session.repository";
import { UserRepository } from "../repositories/user.repository";
import { durationToMilliseconds } from "../utils/duration";
import {
  hashToken,
  newTokenId,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from "../utils/tokens";

const userRepository = new UserRepository();
const sessionRepository = new SessionRepository();

const safeUser = (user: { id: string; email: string; name: string | null; emailVerified: boolean; createdAt: Date }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt
});

const refreshExpiry = (): Date => new Date(Date.now() + durationToMilliseconds(env.REFRESH_TOKEN_TTL));

const createSessionTokens = async (user: { id: string; email: string }) => {
  const sessionId = randomUUID();
  const jti = newTokenId();
  const refreshToken = signRefreshToken(user.id, sessionId, jti);

  await sessionRepository.create({
    id: sessionId,
    userId: user.id,
    jti,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiry()
  });

  return {
    accessToken: signAccessToken(user.id, user.email, sessionId),
    refreshToken
  };
};

export class AuthService {
  async register(input: { email: string; password: string; name?: string }) {
    const email = input.email.trim().toLowerCase();
    if (await userRepository.findByEmail(email)) {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }

    const user = await userRepository.create({
      email,
      passwordHash: await bcrypt.hash(input.password, env.BCRYPT_ROUNDS),
      name: input.name?.trim() || null
    });

    return { user: safeUser(user), ...(await createSessionTokens(user)) };
  }

  async login(input: { email: string; password: string }) {
    const user = await userRepository.findByEmail(input.email.trim().toLowerCase());
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    return { user: safeUser(user), ...(await createSessionTokens(user)) };
  }

  async refresh(rawToken: string) {
    let claims;
    try {
      claims = verifyRefreshToken(rawToken);
    } catch (error) {
      if (error instanceof TokenExpiredError || error instanceof JsonWebTokenError) {
        throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
      }
      throw error;
    }

    if (!claims.sub || !claims.sid || !claims.jti) {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
    }

    const session = await sessionRepository.findById(claims.sid);
    const presentedHash = hashToken(rawToken);

    if (!session || session.userId !== claims.sub) {
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
    }

    if (session.revokedAt || session.refreshTokenHash !== presentedHash || session.jti !== claims.jti) {
      await sessionRepository.revokeAll(claims.sub, "REFRESH_TOKEN_REUSE");
      throw new AppError(401, "REFRESH_TOKEN_REUSED", "Refresh token reuse detected; all sessions were revoked");
    }

    if (session.expiresAt <= new Date()) {
      await sessionRepository.revoke(session.id, claims.sub, "EXPIRED");
      throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
    }

    const user = await userRepository.findById(claims.sub);
    if (!user) throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");

    const newJti = newTokenId();
    const refreshToken = signRefreshToken(user.id, session.id, newJti);
    const rotated = await sessionRepository.rotate(
      session.id,
      presentedHash,
      hashToken(refreshToken),
      newJti,
      refreshExpiry()
    );

    if (!rotated) {
      await sessionRepository.revokeAll(user.id, "CONCURRENT_REFRESH_REUSE");
      throw new AppError(401, "REFRESH_TOKEN_REUSED", "Refresh token reuse detected; all sessions were revoked");
    }

    return {
      accessToken: signAccessToken(user.id, user.email, session.id),
      refreshToken
    };
  }

  async logout(rawToken: string): Promise<void> {
    try {
      const claims = verifyRefreshToken(rawToken);
      if (claims.sub && claims.sid) await sessionRepository.revoke(claims.sid, claims.sub, "LOGOUT");
    } catch (error) {
      if (!(error instanceof TokenExpiredError) && !(error instanceof JsonWebTokenError)) throw error;
    }
  }

  async me(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found");
    return safeUser(user);
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await sessionRepository.listByUserId(userId);
    return sessions.map(({ refreshTokenHash: _hash, jti: _jti, ...session }) => ({
      ...session,
      current: session.id === currentSessionId
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const revoked = await sessionRepository.revoke(sessionId, userId, "USER_REVOKED");
    if (!revoked) throw new AppError(404, "SESSION_NOT_FOUND", "Active session not found");
  }

  async logoutAll(userId: string): Promise<void> {
    await sessionRepository.revokeAll(userId, "LOGOUT_ALL");
  }
}

