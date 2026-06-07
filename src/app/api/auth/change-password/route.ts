import { writeAuditLog } from '@/lib/audit';
import { withAuth } from '@/lib/apiRoute';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { apiError, VALIDATION_ERROR } from '@/lib/errors';
import { getRequestIp } from '@/lib/rate-limit';
import { changePasswordSchema, parseBody } from '@/lib/validation';

export async function POST(request: Request) {
  return withAuth(
    request,
    async (session) => {
      const body = await request.json();
      const parsed = parseBody(changePasswordSchema, body);
      if ('error' in parsed) {
        return apiError(VALIDATION_ERROR, 400);
      }

      const tech = await prisma.technician.findUnique({ where: { id: session.technicianId } });
      if (!tech) {
        return apiError('Account not found.', 404);
      }

      const valid = await verifyPassword(parsed.data.currentPassword, tech.passwordHash);
      if (!valid) {
        return apiError('Current password is incorrect.', 401);
      }

      const passwordHash = await hashPassword(parsed.data.newPassword);
      await prisma.technician.update({
        where: { id: session.technicianId },
        data: { passwordHash },
      });

      await writeAuditLog({
        action: 'auth.password_change',
        dealershipId: session.dealershipId,
        technicianId: session.technicianId,
        entityType: 'technician',
        entityId: session.technicianId,
        ipAddress: getRequestIp(request),
      });

      return { ok: true };
    },
    { rateLimitKey: 'auth.change-password', rateLimit: { limit: 5, windowMs: 60_000 } }
  );
}