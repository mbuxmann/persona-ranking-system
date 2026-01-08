export abstract class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      ...(process.env.NODE_ENV !== "production" && { stack: this.stack }),
    };
  }
}

export class ImportError extends AppError {
  constructor(
    message: string,
    code: ImportErrorCode,
    context: Record<string, unknown> = {}
  ) {
    super(message, code, context);
  }
}

export enum ImportErrorCode {
  VALIDATION_FAILED = "IMPORT_VALIDATION_FAILED",
  JOB_TRIGGER_FAILED = "IMPORT_JOB_TRIGGER_FAILED",
  DB_ERROR = "IMPORT_DB_ERROR",
  PARSE_ERROR = "IMPORT_PARSE_ERROR",
}

export class ExportError extends AppError {
  constructor(
    message: string,
    code: ExportErrorCode,
    context: Record<string, unknown> = {}
  ) {
    super(message, code, context);
  }
}

export enum ExportErrorCode {
  INVALID_PARAMETER = "EXPORT_INVALID_PARAMETER",
  DB_ERROR = "EXPORT_DB_ERROR",
  GENERATION_FAILED = "EXPORT_GENERATION_FAILED",
}
