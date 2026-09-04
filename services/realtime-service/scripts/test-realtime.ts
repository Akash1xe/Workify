import { io, Socket } from "socket.io-client";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const organizationId = required("ORG_ID");
const incidentId = required("INCIDENT_ID");
const tokenA = required("ENGINEER_A_TOKEN");
const tokenB = required("ENGINEER_B_TOKEN");
const nextStatus = process.env.NEXT_STATUS ?? "ACKNOWLEDGED";
const realtimeUrl = process.env.REALTIME_URL ?? "http://localhost:4005";
const gatewayUrl = process.env.GATEWAY_URL ?? "http://localhost:4000";

const connect = (token: string) => new Promise<Socket>((resolve, reject) => {
  const socket = io(realtimeUrl, { auth: { token }, reconnection: false });
  socket.once("connect", () => resolve(socket));
  socket.once("connect_error", reject);
});

const join = (socket: Socket) => new Promise<void>((resolve, reject) => {
  socket.timeout(5_000).emit("incident:join", { organizationId, incidentId }, (error: Error | null, response: { ok: boolean; error?: unknown }) => {
    if (error) return reject(error);
    if (!response.ok) return reject(new Error(`Join rejected: ${JSON.stringify(response.error)}`));
    resolve();
  });
});

const event = (socket: Socket, label: string) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label} did not receive the event`)), 8_000);
  socket.once("incident:status-changed", (payload) => {
    clearTimeout(timer);
    console.log(`${label} received incident:status-changed`, payload);
    resolve();
  });
});

const main = async () => {
  const [engineerA, engineerB] = await Promise.all([connect(tokenA), connect(tokenB)]);
  try {
    await Promise.all([join(engineerA), join(engineerB)]);
    const receives = Promise.all([event(engineerA, "Engineer A"), event(engineerB, "Engineer B")]);
    const response = await fetch(`${gatewayUrl}/api/incidents/organizations/${organizationId}/incidents/${incidentId}/status`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${tokenA}`, "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });
    if (!response.ok) throw new Error(`REST mutation failed (${response.status}): ${await response.text()}`);
    await receives;
    console.log("Success: both authorized clients received the same incident update.");
  } finally {
    engineerA.disconnect();
    engineerB.disconnect();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
