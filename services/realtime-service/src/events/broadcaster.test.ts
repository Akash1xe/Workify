import { describe, expect, it, vi } from "vitest";
import { broadcastRealtimeMessage } from "./broadcaster";

describe("broadcastRealtimeMessage", () => {
  it("emits a valid envelope to its exact room", () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    const io = { to } as never;
    const result = broadcastRealtimeMessage(io, JSON.stringify({
      room: "incident:550e8400-e29b-41d4-a716-446655440002",
      event: "incident:comment-added",
      payload: { incidentId: "550e8400-e29b-41d4-a716-446655440002" }
    }));
    expect(result).toBe(true);
    expect(to).toHaveBeenCalledWith("incident:550e8400-e29b-41d4-a716-446655440002");
    expect(emit).toHaveBeenCalledWith("incident:comment-added", expect.any(Object));
  });

  it("rejects unknown events and arbitrary rooms", () => {
    const io = { to: vi.fn() } as never;
    expect(broadcastRealtimeMessage(io, JSON.stringify({ room: "admin:all", event: "anything", payload: {} }))).toBe(false);
    expect((io as { to: ReturnType<typeof vi.fn> }).to).not.toHaveBeenCalled();
  });
});
