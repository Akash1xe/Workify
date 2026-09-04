import { Router } from "express";
import {
  addComment,
  createIncident,
  deleteComment,
  deleteIncident,
  getIncident,
  listComments,
  listIncidents,
  listTimeline,
  updateComment,
  updateIncident,
  updateIncidentAssignee,
  updateIncidentSeverity,
  updateIncidentStatus
} from "../controllers/incident.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requireOrgMembership } from "../middleware/requireOrgMembership";
import { validateBody, validateParams, validateQuery } from "../middleware/validate";
import {
  commentParamsSchema,
  commentSchema,
  createIncidentSchema,
  incidentParamsSchema,
  listEntriesSchema,
  listIncidentsSchema,
  organizationParamsSchema,
  updateAssigneeSchema,
  updateIncidentSchema,
  updateSeveritySchema,
  updateStatusSchema
} from "../validators/incident.schemas";

const members = ["OWNER", "ADMIN", "ENGINEER", "VIEWER"] as const;
const writers = ["OWNER", "ADMIN", "ENGINEER"] as const;
const managers = ["OWNER", "ADMIN"] as const;

export const incidentRouter = Router({ mergeParams: true });
incidentRouter.use(requireAuth);

incidentRouter.post("/", validateParams(organizationParamsSchema), requireOrgMembership([...writers]), validateBody(createIncidentSchema), createIncident);
incidentRouter.get("/", validateParams(organizationParamsSchema), requireOrgMembership([...members]), validateQuery(listIncidentsSchema), listIncidents);
incidentRouter.get("/:incidentId", validateParams(incidentParamsSchema), requireOrgMembership([...members]), getIncident);
incidentRouter.patch("/:incidentId", validateParams(incidentParamsSchema), requireOrgMembership([...writers]), validateBody(updateIncidentSchema), updateIncident);
incidentRouter.patch("/:incidentId/status", validateParams(incidentParamsSchema), requireOrgMembership([...writers]), validateBody(updateStatusSchema), updateIncidentStatus);
incidentRouter.patch("/:incidentId/severity", validateParams(incidentParamsSchema), requireOrgMembership([...managers]), validateBody(updateSeveritySchema), updateIncidentSeverity);
incidentRouter.patch("/:incidentId/assignee", validateParams(incidentParamsSchema), requireOrgMembership([...writers]), validateBody(updateAssigneeSchema), updateIncidentAssignee);
incidentRouter.get("/:incidentId/timeline", validateParams(incidentParamsSchema), requireOrgMembership([...members]), validateQuery(listEntriesSchema), listTimeline);
incidentRouter.post("/:incidentId/comments", validateParams(incidentParamsSchema), requireOrgMembership([...writers]), validateBody(commentSchema), addComment);
incidentRouter.get("/:incidentId/comments", validateParams(incidentParamsSchema), requireOrgMembership([...members]), validateQuery(listEntriesSchema), listComments);
incidentRouter.patch("/:incidentId/comments/:commentId", validateParams(commentParamsSchema), requireOrgMembership([...writers]), validateBody(commentSchema), updateComment);
incidentRouter.delete("/:incidentId/comments/:commentId", validateParams(commentParamsSchema), requireOrgMembership([...writers]), deleteComment);
incidentRouter.delete("/:incidentId", validateParams(incidentParamsSchema), requireOrgMembership([...managers]), deleteIncident);
