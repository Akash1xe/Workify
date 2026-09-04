import { IncidentStatus, Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError";

const transitions: Record<IncidentStatus, IncidentStatus[]> = {
  TRIGGERED: ["ACKNOWLEDGED", "INVESTIGATING"],
  ACKNOWLEDGED: ["INVESTIGATING"],
  INVESTIGATING: ["MITIGATING"],
  MITIGATING: ["RESOLVED"],
  RESOLVED: []
};

export const assertStatusTransition = (from: IncidentStatus, to: IncidentStatus) => {
  if (!transitions[from].includes(to)) {
    throw new AppError(409, "INVALID_STATUS_TRANSITION", `Incident cannot transition from ${from} to ${to}`);
  }
};

export const transitionTimestamp = (status: IncidentStatus, now: Date): Prisma.IncidentUpdateInput => {
  switch (status) {
    case "ACKNOWLEDGED": return { acknowledgedAt: now };
    case "INVESTIGATING": return { investigatingAt: now };
    case "MITIGATING": return { mitigatingAt: now };
    case "RESOLVED": return { resolvedAt: now };
    default: return {};
  }
};
