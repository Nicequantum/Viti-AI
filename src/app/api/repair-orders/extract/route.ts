import { withAuth } from '@/lib/apiRoute';
import { extractROFromImages } from '@/lib/grok';
import { apiError, VALIDATION_ERROR } from '@/lib/errors';
import { parseBody, imageUrlsSchema } from '@/lib/validation';

export async function POST(request: Request) {
  return withAuth(
    request,
    async () => {
      const body = await request.json();
      const parsed = parseBody(imageUrlsSchema, body);
      if ('error' in parsed) {
        return apiError(VALIDATION_ERROR, 400);
      }

      const extracted = await extractROFromImages(parsed.data.imageUrls);
      return extracted;
    },
    { rateLimitKey: 'ro.extract', rateLimit: { limit: 15, windowMs: 60_000 } }
  );
}