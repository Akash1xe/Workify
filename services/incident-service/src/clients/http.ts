import { env } from "../config/env";

export const dependencyRequest = (url: string, authorization: string) => fetch(url, {
  headers: { authorization },
  signal: AbortSignal.timeout(env.DEPENDENCY_TIMEOUT_MS)
});
