import { writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { prisma } from '@/lib/db';
import { dbToRepairOrder, repairLineToDbFields, repairOrderToDbFields } from '@/lib/roMapper';
import { apiError, NOT_FOUND_ERROR, VALIDATION_ERROR } from '@/lib/errors';
import { getRequestIp } from '@/lib/rate-limit';
import { parseBody, updateRepairOrderSchema } from '@/lib/validation';
import { emptyExtractedData } from '@/utils/diagnosticParser';

async function canAccess(session: { technicianId: string; role: string; dealershipId: string }, roId: string) {
  const ro = await prisma.repairOrder.findUnique({ where: { id: roId }, include: { repairLines: true } });
  if (!ro) return null;
  if (session.role === 'manager' && ro.dealershipId === session.dealershipId) return ro;
  if (ro.technicianId === session.technicianId) return ro;
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(
    request,
    async (session) => {
      const ro = await canAccess(session, id);
      if (!ro) return apiError(NOT_FOUND_ERROR, 404);

      const full = await prisma.repairOrder.findUnique({
        where: { id },
        include: { repairLines: true },
      });

      return { repairOrder: dbToRepairOrder(full!) };
    },
    { rateLimitKey: 'ros.get' }
  );
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(
    request,
    async (session) => {
      const existing = await canAccess(session, id);
      if (!existing) return apiError(NOT_FOUND_ERROR, 404);

      const body = await request.json();
      const parsed = parseBody(updateRepairOrderSchema, body);
      if ('error' in parsed) {
        return apiError(VALIDATION_ERROR, 400);
      }

      const data = parsed.data;
      const input = {
        roNumber: data.roNumber ?? existing.roNumber,
        vehicle: {
          vin: data.vehicle?.vin ?? existing.vin,
          year: data.vehicle?.year ?? existing.year,
          make: data.vehicle?.make ?? existing.make,
          model: data.vehicle?.model ?? existing.model,
          engine: data.vehicle?.engine ?? existing.engine,
          mileageIn: data.vehicle?.mileageIn ?? existing.mileageIn,
          mileageOut: data.vehicle?.mileageOut ?? existing.mileageOut,
        },
        customer: data.customer ?? { name: '' },
        complaints: data.complaints ?? JSON.parse(existing.complaints),
        xentryImages: data.xentryImages,
        xentryOcrTexts: data.xentryOcrTexts,
        repairLines: data.repairLines,
      };

      const storyEdits: Array<{ lineId: string; lineNumber: number }> = [];
      if (data.repairLines) {
        for (const line of data.repairLines) {
          if (!line.id || line.warrantyStory === undefined) continue;
          const prev = existing.repairLines.find((l) => l.id === line.id);
          if (prev && prev.warrantyStory !== line.warrantyStory) {
            storyEdits.push({ lineId: line.id, lineNumber: prev.lineNumber });
          }
        }
      }

      await prisma.repairOrder.update({
        where: { id },
        data: repairOrderToDbFields(input as Parameters<typeof repairOrderToDbFields>[0]),
      });

      if (data.repairLines && Array.isArray(data.repairLines)) {
        for (const line of data.repairLines) {
          if (line.id) {
            const lineFields = repairLineToDbFields({
              id: line.id,
              lineNumber: line.lineNumber || 1,
              description: line.description || 'Enter repair description',
              customerConcern: line.customerConcern || '',
              technicianNotes: line.technicianNotes || '',
              xentryImages: line.xentryImages || [],
              xentryOcrTexts: line.xentryOcrTexts || [],
              extractedData: { ...emptyExtractedData(), ...line.extractedData },
              warrantyStory: line.warrantyStory,
            });

            await prisma.repairLine.upsert({
              where: { id: line.id },
              update: lineFields,
              create: {
                id: line.id,
                repairOrderId: id,
                ...lineFields,
              },
            });
          }
        }

        const incomingIds = new Set(data.repairLines.map((l) => l.id).filter(Boolean));
        const dbLines = await prisma.repairLine.findMany({ where: { repairOrderId: id } });
        for (const dbLine of dbLines) {
          if (!incomingIds.has(dbLine.id)) {
            await prisma.repairLine.delete({ where: { id: dbLine.id } });
          }
        }
      }

      const updated = await prisma.repairOrder.findUnique({
        where: { id },
        include: { repairLines: true },
      });

      await writeAuditLog({
        action: 'ro.update',
        dealershipId: session.dealershipId,
        technicianId: session.technicianId,
        entityType: 'repairOrder',
        entityId: id,
        metadata: { roNumber: updated!.roNumber },
        ipAddress: getRequestIp(request),
      });

      for (const edit of storyEdits) {
        await writeAuditLog({
          action: 'story.edit',
          dealershipId: session.dealershipId,
          technicianId: session.technicianId,
          entityType: 'repairLine',
          entityId: edit.lineId,
          metadata: { repairOrderId: id, lineNumber: edit.lineNumber },
          ipAddress: getRequestIp(request),
        });
      }

      return { repairOrder: dbToRepairOrder(updated!) };
    },
    { rateLimitKey: 'ros.update' }
  );
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuth(
    request,
    async (session) => {
      const existing = await canAccess(session, id);
      if (!existing) return apiError(NOT_FOUND_ERROR, 404);

      await prisma.repairOrder.delete({ where: { id } });

      await writeAuditLog({
        action: 'ro.delete',
        dealershipId: session.dealershipId,
        technicianId: session.technicianId,
        entityType: 'repairOrder',
        entityId: id,
        metadata: { roNumber: existing.roNumber },
        ipAddress: getRequestIp(request),
      });

      return { ok: true };
    },
    { rateLimitKey: 'ros.delete' }
  );
}