import { ERROR_STATUS, type ErrorCode } from '@parkly/contracts';

/** Throw this from services and routes; the app turns it into problem+json. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail: string | undefined;
  readonly headers: Record<string, string>;
  readonly errors: { path: string; message: string }[] | undefined;

  constructor(
    code: ErrorCode,
    detail?: string,
    options: {
      headers?: Record<string, string>;
      errors?: { path: string; message: string }[];
    } = {},
  ) {
    super(detail ?? code);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.detail = detail;
    this.headers = options.headers ?? {};
    this.errors = options.errors;
  }
}
