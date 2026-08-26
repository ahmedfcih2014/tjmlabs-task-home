import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

export type ErrorObject = {
  field: string;
  constraints: Record<string, string>;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : ((exception as { message: string })?.message ?? null);

    let message = 'Internal server error';
    let errors: unknown = undefined;

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (exceptionResponse && typeof exceptionResponse === 'object') {
      message =
        'message' in exceptionResponse
          ? String(exceptionResponse.message)
          : message;

      errors =
        'errors' in exceptionResponse ? exceptionResponse.errors : undefined;
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(errors
        ? {
            errors: this.mapErrorsasObbject(errors as ErrorObject[]),
          }
        : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private mapErrorsasObbject(
    errorsData: ErrorObject[] | undefined,
  ): Record<string, string> {
    const errors: Record<string, string> = {};
    errorsData?.forEach(({ field, constraints }) => {
      errors[field] =
        `${field}: ` +
        Object.values(constraints)
          .map((v) => v.replace(field, '').trim())
          .join(', ');
    });
    return errors;
  }
}
