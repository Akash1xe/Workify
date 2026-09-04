import jwt from "jsonwebtoken";
import { Socket } from "socket.io";
import { env } from "../config/env";

type Claims = jwt.JwtPayload & { sub: string; email: string; sid: string };

const handshakeToken = (socket: Socket) => {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken) return authToken;
  const authorization = socket.handshake.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) return authorization.slice(7);
  return null;
};

export const socketAuth = (socket: Socket, next: (error?: Error) => void) => {
  const token = handshakeToken(socket);
  if (!token) return next(new Error("AUTHENTICATION_REQUIRED"));

  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE
    }) as Claims;
    if (!claims.sub || typeof claims.email !== "string" || typeof claims.sid !== "string") {
      throw new Error("Invalid token claims");
    }
    socket.data.user = { id: claims.sub, email: claims.email, sessionId: claims.sid };
    socket.data.authorization = `Bearer ${token}`;
    next();
  } catch {
    next(new Error("AUTHENTICATION_FAILED"));
  }
};
