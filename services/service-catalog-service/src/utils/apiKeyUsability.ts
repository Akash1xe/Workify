export const isApiKeyUsable = (apiKey: { revoked: boolean; expiresAt: Date | null }, now = new Date()): boolean =>
  !apiKey.revoked && (!apiKey.expiresAt || apiKey.expiresAt > now);
