import { NextResponse } from 'next/server';
import { getSession } from './auth';
import { apiError, FORBIDDEN_ERROR, GENERIC_ERROR, handleRouteError, UNAUTHORIZED_ERROR } from './errors';
import { checkRateLimit, RATE_LIMITS, type RateLimitConfig } from './rate-limit';

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

interface RouteOptions {
  rateLimitKey?: string;
  rateLimit?: RateLimitConfig;
  requireManager?: boolean;
}

export async function withAuth<T>(
  request: Request,
  handler: (session: Session) => Promise<T>,
  options: RouteOptions = {}
): Promise<NextResponse> {
  const rateLimited = checkRateLimit(
    request,
    options.rateLimitKey || 'api',
    options.rateLimit || RATE_LIMITS.default
  );
  if (rateLimited) return rateLimited as NextResponse;

  const session = await getSession();
  if (!session) {
    return apiError(UNAUTHORIZED_ERROR, 401);
  }

  if (options.requireManager && session.role !== 'manager') {
    return apiError(FORBIDDEN_ERROR, 403);
  }

  try {
    const result = await handler(session);
    return result instanceof NextResponse ? result : NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, options.rateLimitKey || 'api');
  }
}

export async function withPublicRoute<T>(
  request: Request,
  handler: () => Promise<T>,
  options: RouteOptions = {}
): Promise<NextResponse> {
  const rateLimited = checkRateLimit(
    request,
    options.rateLimitKey || 'public',
    options.rateLimit || RATE_LIMITS.default
  );
  if (rateLimited) return rateLimited as NextResponse;

  try {
    const result = await handler();
    return result instanceof NextResponse ? result : NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, options.rateLimitKey || 'public');
  }
}

export function jsonError(message: string, status: number): NextResponse {
  return apiError(message, status);
}

export { GENERIC_ERROR };