import { RequestHandler } from "express";
import { env } from "../config/env";
import { redis } from "../config/redis";

const incrementScript = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return current
`;

export const rateLimit: RequestHandler = async (req, res, next) => {
  const key = `rate-limit:${req.ip ?? "unknown"}`;

  try {
    const count = Number(await redis.eval(incrementScript, 1, key, env.RATE_LIMIT_WINDOW_SECONDS));
    res.setHeader("x-ratelimit-limit", env.RATE_LIMIT_REQUESTS);
    res.setHeader("x-ratelimit-remaining", Math.max(0, env.RATE_LIMIT_REQUESTS - count));

    if (count > env.RATE_LIMIT_REQUESTS) {
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests" } });
      return;
    }
  } catch (error) {
    console.error("Rate limiter unavailable; request allowed", {
      requestId: req.header("x-request-id"),
      message: error instanceof Error ? error.message : "Unknown Redis error"
    });
  }

  next();
};

