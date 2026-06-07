import { NextResponse } from 'next/server';

export const GENERIC_ERROR = 'Something went wrong. Please try again or contact your administrator.';
export const UNAUTHORIZED_ERROR = 'You must be signed in to perform this action.';
export const FORBIDDEN_ERROR = 'You do not have permission to perform this action.';
export const NOT_FOUND_ERROR = 'The requested resource was not found.';
export const VALIDATION_ERROR = 'Invalid request. Please check your input and try again.';
export const RATE_LIMIT_ERROR = 'Too many requests. Please wait a moment and try again.';

export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function handleRouteError(error: unknown, context: string): NextResponse {
  console.error(`[${context}]`, error);
  return apiError(GENERIC_ERROR, 500);
}