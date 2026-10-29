export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, code: string = 'INTERNAL_ERROR', statusCode: number = 500, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class AuthError extends AppError {
  constructor(message: string = 'Unauthorized', details?: unknown) {
    super(message, 'UNAUTHORIZED', 401, details);
    this.name = 'AuthError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation Failed', details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource Not Found', details?: unknown) {
    super(message, 'NOT_FOUND', 404, details);
    this.name = 'NotFoundError';
  }
}

export class PermissionError extends AppError {
  constructor(message: string = 'Forbidden', details?: unknown) {
    super(message, 'FORBIDDEN', 403, details);
    this.name = 'PermissionError';
  }
}
