import { writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { resolveServiceAdvisor } from '@/lib/advisorIntelligence';
import { apiError, VALIDATION_ERROR } from '@/lib/errors';
import { getRequestIp } from '@/lib/rate-limit';
import { parseBody, resolveAdvisorSchema } from '@/lib/validation';

export async function POST(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const body = await request.json();
      const parsed = parseBody(resolveAdvisorSchema, body);
      if ('error' in parsed) {
        return apiError(VALIDATION_ERROR, 400);
      }

      const resolved = await resolveServiceAdvisor(
        session.dealershipId,
        parsed.data.serviceAdvisorName
      );

      if (!resolved) {
        return apiError('Could not resolve a valid service advisor name', 400);
      }

      await writeAuditLog({
        action: 'advisor.resolve',
        dealershipId: session.dealershipId,
        technicianId: session.technicianId,
        entityType: 'serviceAdvisor',
        entityId: resolved.id,
        metadata: {
          displayName: resolved.displayName,
          isNew: resolved.isNew,
          matchedViaAlias: resolved.matchedViaAlias,
        },
        ipAddress: getRequestIp(request),
      });

      return { serviceAdvisor: resolved };
    },
    { rateLimitKey: 'advisors.resolve' }
  );
}