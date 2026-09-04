import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "./errorHandler";

describe("errorHandler", () => {
  it("maps oversized JSON bodies to 413", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    errorHandler(
      { type: "entity.too.large" },
      { header: vi.fn().mockReturnValue("request-1") } as never,
      { status, json } as never,
      vi.fn()
    );
    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: { code: "PAYLOAD_TOO_LARGE", message: expect.any(String) } }));
  });
});
