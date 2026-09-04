import { describe, expect, it, vi } from "vitest";
import { requireServiceApiKey } from "./requireServiceApiKey";

describe("requireServiceApiKey", () => {
  it("rejects a missing x-api-key with 401", async () => {
    const next = vi.fn();
    await requireServiceApiKey({ header: vi.fn().mockReturnValue(undefined) } as never, {} as never, next);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401, code: "INVALID_API_KEY" });
  });
});
