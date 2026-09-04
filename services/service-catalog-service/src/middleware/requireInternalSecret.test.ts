import { describe, expect, it, vi } from "vitest";
import { env } from "../config/env";
import { requireInternalSecret } from "./requireInternalSecret";

describe("requireInternalSecret", () => {
  it("rejects a missing or incorrect secret", () => {
    const next = vi.fn();
    requireInternalSecret({ header: vi.fn().mockReturnValue("wrong") } as never, {} as never, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401, code: "INVALID_INTERNAL_SECRET" });
  });

  it("accepts the configured internal secret", () => {
    const next = vi.fn();
    requireInternalSecret({ header: vi.fn().mockReturnValue(env.INTERNAL_SERVICE_SECRET) } as never, {} as never, next);
    expect(next).toHaveBeenCalledWith();
  });
});
