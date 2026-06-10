import { prisma } from './db';

export type ImageAccessSession = {
  technicianId: string;
  role: string;
  dealershipId: string;
};

/** True when the session may read this private blob (RO attachment or recent own upload). */
export async function userCanAccessImage(
  session: ImageAccessSession,
  pathname: string
): Promise<boolean> {
  const orders = await prisma.repairOrder.findMany({
    where: {
      dealershipId: session.dealershipId,
      ...(session.role === 'manager' ? {} : { technicianId: session.technicianId }),
      OR: [
        { xentryImageUrls: { contains: pathname } },
        { repairLines: { some: { xentryImageUrls: { contains: pathname } } } },
      ],
    },
    select: { id: true },
    take: 1,
  });

  if (orders.length > 0) return true;

  // Allow freshly uploaded images not yet attached to an RO (same dealership session)
  const recentUpload = await prisma.auditLog.findFirst({
    where: {
      action: 'image.upload',
      dealershipId: session.dealershipId,
      technicianId: session.technicianId,
      metadata: { contains: pathname },
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });

  return Boolean(recentUpload);
}