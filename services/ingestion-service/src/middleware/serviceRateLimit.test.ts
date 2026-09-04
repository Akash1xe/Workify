import { describe, expect, it, vi } from "vitest";
import { ServiceRateLimiter } from "../services/rateLimit.service";
import { serviceRateLimit } from "./serviceRateLimit";

const request = { serviceIdentity: { service: { id: "service-a" } } };

describe("serviceRateLimit", () => {
  it("returns 429 after the service limit", async () => {
    const limiter = { check: vi.fn().mockResolvedValue({ allowed: false, count: 101 }) } as ServiceRateLimiter;
    const next = vi.fn();
    await serviceRateLimit(limiter)(request as never, {} as never, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 429, code: "RATE_LIMITED" });
  });

  it("fails open when the limiter backend throws", async () => {
    const limiter = { check: vi.fn().mockRejectedValue(new Error("Redis unavailable")) } as ServiceRateLimiter;
    const next = vi.fn();
    await serviceRateLimit(limiter)(request as never, {} as never, next);
    expect(next).toHaveBeenCalledWith();
  });
});
