import { streamPrivateBlob } from '@/lib/blob';
import { getSession } from '@/lib/auth';
import { apiError, FORBIDDEN_ERROR, NOT_FOUND_ERROR, UNAUTHORIZED_ERROR } from '@/lib/errors';
import { userCanAccessImage } from '@/lib/imageAccess';
import { isAllowedImagePathname } from '@/lib/imageUrls';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  const rateLimited = await checkRateLimit(request, 'images.get');
  if (rateLimited) return rateLimited;

  const session = await getSession(request);
  if (!session) {
    return apiError(UNAUTHORIZED_ERROR, 401);
  }

  const pathname = new URL(request.url).searchParams.get('pathname');
  if (!pathname || !isAllowedImagePathname(pathname)) {
    return apiError(NOT_FOUND_ERROR, 404);
  }

  const allowed = await userCanAccessImage(session, pathname);
  if (!allowed) {
    return apiError(FORBIDDEN_ERROR, 403);
  }

  try {
    const result = await streamPrivateBlob(pathname);
    if (!result) {
      return apiError(NOT_FOUND_ERROR, 404);
    }

    return new Response(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType || 'application/octet-stream',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[images]', error);
    return apiError('Unable to load image.', 500);
  }
}