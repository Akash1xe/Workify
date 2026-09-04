import { createHash, randomBytes } from "node:crypto";

export const generateApiKey = (): string => `snt_live_${randomBytes(24).toString("hex")}`;
export const hashApiKey = (key: string): string => createHash("sha256").update(key).digest("hex");
export const apiKeyPrefix = (key: string): string => key.slice(0, 20);

