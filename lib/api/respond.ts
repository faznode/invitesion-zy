import { z } from 'zod';

/** Single consistent error body across the invitation API (api-and-interface-design). */
export function apiError(status: number, code: string, message: string, details?: unknown) {
  return Response.json({ error: { code, message, details } }, { status });
}

export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Map a Zod flatten result to the standard 422 response. */
export function validationError(err: z.ZodError) {
  return apiError(422, 'VALIDATION_ERROR', 'Invalid request body', err.flatten());
}
