import { RequestHandler } from "express";
import { IncidentService } from "../services/incident.service";

const service = new IncidentService();

const organizationId = (params: Record<string, unknown>) => params.organizationId as string;
const incidentId = (params: Record<string, unknown>) => params.incidentId as string;
const pageQuery = (query: Record<string, unknown>) => ({ page: query.page as number, limit: query.limit as number });

export const createIncident: RequestHandler = async (req, res, next) => {
  try {
    const incident = await service.create(organizationId(req.params), req.user!.id, req.header("authorization")!, req.body);
    res.status(201).json({ incident });
  } catch (error) { next(error); }
};

export const listIncidents: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = pageQuery(req.query);
    const { status, severity, serviceId, assignedToUserId } = req.query;
    res.json(await service.list(
      organizationId(req.params),
      { status: status as never, severity: severity as never, serviceId: serviceId as string | undefined, assignedToUserId: assignedToUserId as string | undefined },
      page,
      limit
    ));
  } catch (error) { next(error); }
};

export const getIncident: RequestHandler = async (req, res, next) => {
  try { res.json({ incident: await service.get(organizationId(req.params), incidentId(req.params)) }); } catch (error) { next(error); }
};

export const updateIncident: RequestHandler = async (req, res, next) => {
  try {
    res.json({ incident: await service.updateDetails(organizationId(req.params), incidentId(req.params), req.user!.id, req.body) });
  } catch (error) { next(error); }
};

export const updateIncidentStatus: RequestHandler = async (req, res, next) => {
  try {
    res.json({ incident: await service.updateStatus(organizationId(req.params), incidentId(req.params), req.user!.id, req.body.status) });
  } catch (error) { next(error); }
};

export const updateIncidentSeverity: RequestHandler = async (req, res, next) => {
  try {
    res.json({ incident: await service.updateSeverity(organizationId(req.params), incidentId(req.params), req.user!.id, req.body.severity) });
  } catch (error) { next(error); }
};

export const updateIncidentAssignee: RequestHandler = async (req, res, next) => {
  try {
    res.json({ incident: await service.updateAssignee(
      organizationId(req.params),
      incidentId(req.params),
      req.user!.id,
      req.header("authorization")!,
      req.body.userId
    ) });
  } catch (error) { next(error); }
};

export const listTimeline: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = pageQuery(req.query);
    res.json(await service.listTimeline(organizationId(req.params), incidentId(req.params), page, limit));
  } catch (error) { next(error); }
};

export const addComment: RequestHandler = async (req, res, next) => {
  try {
    const comment = await service.addComment(organizationId(req.params), incidentId(req.params), req.user!.id, req.body.body);
    res.status(201).json({ comment });
  } catch (error) { next(error); }
};

export const listComments: RequestHandler = async (req, res, next) => {
  try {
    const { page, limit } = pageQuery(req.query);
    res.json(await service.listComments(organizationId(req.params), incidentId(req.params), page, limit));
  } catch (error) { next(error); }
};

export const updateComment: RequestHandler = async (req, res, next) => {
  try {
    const comment = await service.updateComment(
      organizationId(req.params), incidentId(req.params), req.params.commentId as string, req.user!.id, req.body.body
    );
    res.json({ comment });
  } catch (error) { next(error); }
};

export const deleteComment: RequestHandler = async (req, res, next) => {
  try {
    await service.deleteComment(organizationId(req.params), incidentId(req.params), req.params.commentId as string, req.user!.id);
    res.status(204).send();
  } catch (error) { next(error); }
};

export const deleteIncident: RequestHandler = async (req, res, next) => {
  try {
    await service.deleteIncident(organizationId(req.params), incidentId(req.params));
    res.status(204).send();
  } catch (error) { next(error); }
};
