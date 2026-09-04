import { beforeAll, describe, expect, it } from "vitest";

describe("token utilities", () => {
  beforeAll(() => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    process.env.JWT_ACCESS_SECRET = "test-access-secret-12345678901234567890";
    process.env.JWT_REFRESH_SECRET = "test-refresh-secret-1234567890123456789";
  });

  it("signs and verifies access-token identity and session claims", async () => {
    const { signAccessToken, verifyAccessToken } = await import("./tokens");
    const claims = verifyAccessToken(signAccessToken("user-1", "akash@example.com", "session-1"));

    expect(claims.sub).toBe("user-1");
    expect(claims.email).toBe("akash@example.com");
    expect(claims.sid).toBe("session-1");
  });

  it("signs and verifies refresh-token sid and jti claims", async () => {
    const { signRefreshToken, verifyRefreshToken } = await import("./tokens");
    const claims = verifyRefreshToken(signRefreshToken("user-1", "session-1", "token-1"));

    expect(claims.sub).toBe("user-1");
    expect(claims.sid).toBe("session-1");
    expect(claims.jti).toBe("token-1");
  });

  it("hashes tokens deterministically without retaining the raw token", async () => {
    const { hashToken } = await import("./tokens");
    const hash = hashToken("raw-refresh-token");

    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashToken("raw-refresh-token"));
    expect(hash).not.toContain("raw-refresh-token");
  });
});

