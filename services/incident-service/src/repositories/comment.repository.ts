import { Prisma, TimelineEventType } from "@prisma/client";
import { prisma } from "../config/database";

export class CommentRepository {
  createWithTimeline(organizationId: string, incidentId: string, authorUserId: string, body: string) {
    return prisma.$transaction(async (tx) => {
      const parent = await tx.incident.findFirst({ where: { id: incidentId, organizationId }, select: { id: true } });
      if (!parent) return null;
      const comment = await tx.incidentComment.create({ data: { incidentId, authorUserId, body } });
      await tx.incidentTimelineEvent.create({
        data: {
          incidentId,
          type: TimelineEventType.COMMENT_ADDED,
          actorUserId: authorUserId,
          message: "Comment added",
          metadata: { commentId: comment.id }
        }
      });
      return comment;
    });
  }

  findScoped(organizationId: string, incidentId: string, id: string) {
    return prisma.incidentComment.findFirst({
      where: { id, incidentId, incident: { organizationId } }
    });
  }

  async list(organizationId: string, incidentId: string, page: number, limit: number) {
    const where: Prisma.IncidentCommentWhereInput = { incidentId, incident: { organizationId } };
    const [items, total] = await prisma.$transaction([
      prisma.incidentComment.findMany({ where, orderBy: { createdAt: "asc" }, skip: (page - 1) * limit, take: limit }),
      prisma.incidentComment.count({ where })
    ]);
    return { items, total };
  }

  update(organizationId: string, incidentId: string, id: string, body: string) {
    return prisma.incidentComment.updateMany({
      where: { id, incidentId, incident: { organizationId } },
      data: { body }
    });
  }

  delete(organizationId: string, incidentId: string, id: string) {
    return prisma.incidentComment.deleteMany({ where: { id, incidentId, incident: { organizationId } } });
  }
}
