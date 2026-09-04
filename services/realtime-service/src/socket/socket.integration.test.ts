import { createServer, Server as HttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as createClient, Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "../clients/authorization.client";
import { env } from "../config/env";
import { broadcastRealtimeMessage } from "../events/broadcaster";
import { socketAuth } from "../middleware/socketAuth";
import { registerSocketHandlers } from "./handlers";

const ORG_ID = "550e8400-e29b-41d4-a716-446655440001";
const INCIDENT_A = "550e8400-e29b-41d4-a716-446655440002";
const INCIDENT_B = "550e8400-e29b-41d4-a716-446655440003";
const sockets: ClientSocket[] = [];
let io: Server | undefined;
let httpServer: HttpServer | undefined;

const token = () => jwt.sign(
  { sub: "user-a", email: "a@example.com", sid: "session-a" },
  env.JWT_ACCESS_SECRET,
  { algorithm: "HS256", issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, expiresIn: "5m" }
);

const start = async (dependencies = { verifyMembership: vi.fn(), verifyIncident: vi.fn() }) => {
  httpServer = createServer();
  io = new Server(httpServer);
  io.use(socketAuth);
  registerSocketHandlers(io, dependencies);
  await new Promise<void>((resolve) => httpServer!.listen(0, "127.0.0.1", resolve));
  const port = (httpServer.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, dependencies };
};

const connect = (url: string, authToken?: string) => new Promise<ClientSocket>((resolve, reject) => {
  const client = createClient(url, { auth: authToken ? { token: authToken } : {}, reconnection: false, forceNew: true });
  sockets.push(client);
  client.once("connect", () => resolve(client));
  client.once("connect_error", reject);
});

const join = (client: ClientSocket, incidentId = INCIDENT_A) => new Promise<Record<string, unknown>>((resolve) => {
  client.emit("incident:join", { organizationId: ORG_ID, incidentId }, resolve);
});

afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.disconnect());
  if (io) await new Promise<void>((resolve) => io!.close(() => resolve()));
  httpServer = undefined;
  io = undefined;
});

describe("realtime socket security and rooms", () => {
  it("rejects a socket without a token", async () => {
    const { url } = await start();
    await expect(connect(url)).rejects.toMatchObject({ message: "AUTHENTICATION_REQUIRED" });
  });

  it("rejects an invalid token", async () => {
    const { url } = await start();
    await expect(connect(url, "invalid-token")).rejects.toMatchObject({ message: "AUTHENTICATION_FAILED" });
  });

  it("allows a valid token to connect", async () => {
    const { url } = await start();
    await expect(connect(url, token())).resolves.toMatchObject({ connected: true });
  });

  it("allows a verified member to join the matching incident room", async () => {
    const { url, dependencies } = await start();
    const client = await connect(url, token());
    await expect(join(client)).resolves.toMatchObject({ ok: true, incidentId: INCIDENT_A });
    expect(dependencies.verifyMembership).toHaveBeenCalledWith(ORG_ID, expect.stringMatching(/^Bearer /));
    expect(dependencies.verifyIncident).toHaveBeenCalledWith(ORG_ID, INCIDENT_A, expect.stringMatching(/^Bearer /));
  });

  it("denies a non-member before checking the incident", async () => {
    const dependencies = {
      verifyMembership: vi.fn().mockRejectedValue(new AuthorizationError("MEMBERSHIP_REQUIRED", "Membership required")),
      verifyIncident: vi.fn()
    };
    const { url } = await start(dependencies);
    const client = await connect(url, token());
    await expect(join(client)).resolves.toMatchObject({ ok: false, error: { code: "MEMBERSHIP_REQUIRED" } });
    expect(dependencies.verifyIncident).not.toHaveBeenCalled();
    const received = vi.fn();
    client.on("incident:status-changed", received);
    io!.to(`incident:${INCIDENT_A}`).emit("incident:status-changed", { incidentId: INCIDENT_A });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(received).not.toHaveBeenCalled();
  });

  it("denies an incident that does not belong to the organization", async () => {
    const dependencies = {
      verifyMembership: vi.fn(),
      verifyIncident: vi.fn().mockRejectedValue(new AuthorizationError("INCIDENT_NOT_FOUND", "Incident not found"))
    };
    const { url } = await start(dependencies);
    const client = await connect(url, token());
    await expect(join(client)).resolves.toMatchObject({ ok: false, error: { code: "INCIDENT_NOT_FOUND" } });
  });

  it("broadcasts a Redis event only to clients in the addressed incident room", async () => {
    const { url } = await start();
    const clientA = await connect(url, token());
    const clientB = await connect(url, token());
    await join(clientA, INCIDENT_A);
    await join(clientB, INCIDENT_B);

    const received = new Promise<Record<string, unknown>>((resolve) => clientA.once("incident:status-changed", resolve));
    const wrongRoom = vi.fn();
    clientB.on("incident:status-changed", wrongRoom);
    expect(broadcastRealtimeMessage(io!, JSON.stringify({
      room: `incident:${INCIDENT_A}`,
      event: "incident:status-changed",
      payload: { incidentId: INCIDENT_A, organizationId: ORG_ID, from: "TRIGGERED", to: "ACKNOWLEDGED" }
    }))).toBe(true);

    await expect(received).resolves.toMatchObject({ incidentId: INCIDENT_A, to: "ACKNOWLEDGED" });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(wrongRoom).not.toHaveBeenCalled();
  });

  it("leaves the room and Socket.IO cleans rooms on disconnect", async () => {
    const { url } = await start();
    const client = await connect(url, token());
    await join(client);
    const left = await new Promise<Record<string, unknown>>((resolve) => {
      client.emit("incident:leave", { incidentId: INCIDENT_A }, resolve);
    });
    expect(left).toMatchObject({ ok: true });
    client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(io!.sockets.sockets.size).toBe(0);
  });
});
