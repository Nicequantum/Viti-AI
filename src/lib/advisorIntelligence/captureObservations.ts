import type { Prisma } from '@prisma/client';
import { encryptPII } from '@/lib/encryption';
import { prisma } from '@/lib/db';
import { complaintLineLabel, inferVehicleFamily } from './nameUtils';
import { recomputeAdvisorProfile } from './recomputeProfile';
import { resolveServiceAdvisor, type ResolvedServiceAdvisor } from './resolveAdvisor';

export type AdvisorExtractionSource = 'grok' | 'ocr_fallback' | 'manual';

export interface CaptureAdvisorIntelligenceInput {
  dealershipId: string;
  repairOrderId: string;
  serviceAdvisorName?: string;
  complaints: string[];
  vehicle: { make?: string; model?: string };
  extractionSource: AdvisorExtractionSource;
  extractionConfidence?: number;
  wasCorrected?: boolean;
}

export interface CaptureAdvisorIntelligenceResult {
  serviceAdvisor: ResolvedServiceAdvisor | null;
}

type DbClient = Prisma.TransactionClient;

export async function captureAdvisorIntelligence(
  input: CaptureAdvisorIntelligenceInput,
  client: DbClient = prisma
): Promise<CaptureAdvisorIntelligenceResult> {
  const complaints = input.complaints.map((c) => c.trim()).filter((c) => c.length >= 3);
  const advisorName = input.serviceAdvisorName?.trim();

  if (!advisorName) {
    return { serviceAdvisor: null };
  }

  const existingRo = await client.repairOrder.findUnique({
    where: { id: input.repairOrderId },
    select: { serviceAdvisorId: true },
  });

  const alreadyLinked = Boolean(existingRo?.serviceAdvisorId);
  const resolved = await resolveServiceAdvisor(input.dealershipId, advisorName, client, {
    incrementRoCount: !alreadyLinked,
  });
  if (!resolved) {
    return { serviceAdvisor: null };
  }

  const vehicleFamily = inferVehicleFamily(input.vehicle.make || '', input.vehicle.model || '');

  await client.repairOrder.update({
    where: { id: input.repairOrderId },
    data: {
      serviceAdvisorId: resolved.id,
      serviceAdvisorNameEncrypted: encryptPII(advisorName),
      advisorMatchConfidence: resolved.matchConfidence,
      advisorIdentifiedAt: new Date(),
    },
  });

  await client.advisorComplaintObservation.deleteMany({
    where: { repairOrderId: input.repairOrderId },
  });

  if (complaints.length > 0) {
    await client.advisorComplaintObservation.createMany({
      data: complaints.map((complaint, index) => ({
        dealershipId: input.dealershipId,
        serviceAdvisorId: resolved.id,
        repairOrderId: input.repairOrderId,
        lineLabel: complaintLineLabel(index),
        complaintTextEncrypted: encryptPII(complaint),
        extractionSource: input.extractionSource,
        extractionConfidence: input.extractionConfidence ?? null,
        wasCorrected: input.wasCorrected ?? false,
        vehicleMake: input.vehicle.make || null,
        vehicleModel: input.vehicle.model || null,
        vehicleFamily,
      })),
    });
  }

  await recomputeAdvisorProfile(resolved.id, client);

  return { serviceAdvisor: resolved };
}