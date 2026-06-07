import { withAuth } from '@/lib/apiRoute';
import { apiError, VALIDATION_ERROR } from '@/lib/errors';
import { decodeVin } from '@/lib/vin';
import { parseBody, vinSchema } from '@/lib/validation';

export async function POST(request: Request) {
  return withAuth(
    request,
    async () => {
      const body = await request.json();
      const parsed = parseBody(vinSchema, body);
      if ('error' in parsed) {
        return apiError(VALIDATION_ERROR, 400);
      }

      const result = await decodeVin(parsed.data.vin);
      return result;
    },
    { rateLimitKey: 'vin.decode' }
  );
}