import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Client-side helper (used by store/components to throw on fetch errors)
// ---------------------------------------------------------------------------

export async function throwIfError(response: Response, fallback: string) {
  if (!response.ok) {
    let message = fallback;
    try {
      const body = await response.json();
      message = body.error || body.message || fallback;
    } catch {}
    throw new Error(message);
  }
  return response;
}

// ---------------------------------------------------------------------------
// Server-side API error handling (used by route handlers)
// ---------------------------------------------------------------------------

/** Typed API error with HTTP status code. */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Convert any caught error into a structured JSON response.
 * Known ApiError instances preserve their status code; unknown errors
 * return 500 with a generic message (never leaking internals).
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        statusCode: error.statusCode,
        error: error.message,
        ...(error.details !== undefined && { details: error.details }),
      },
      { status: error.statusCode },
    );
  }

  console.error('Unhandled API error:', error);

  return NextResponse.json(
    { statusCode: 500, error: 'Internal server error' },
    { status: 500 },
  );
}
