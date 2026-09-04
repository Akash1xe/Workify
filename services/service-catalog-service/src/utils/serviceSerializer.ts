import { Service, ServiceStatus } from "@prisma/client";

export const STALE_HEARTBEAT_MS = 90_000;

export const serializeService = (service: Service, now = new Date()) => {
  const isStale = !service.lastHeartbeatAt || now.getTime() - service.lastHeartbeatAt.getTime() > STALE_HEARTBEAT_MS;
  return {
    ...service,
    status: isStale ? ServiceStatus.UNKNOWN : service.status,
    isStale
  };
};

