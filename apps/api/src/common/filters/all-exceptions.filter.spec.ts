import { ArgumentsHost, BadRequestException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';

import { AllExceptionsFilter } from './all-exceptions.filter';

function buildHost(request: { method: string; url: string }, response: { status: jest.Mock; json: jest.Mock }): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let response: { status: jest.Mock; json: jest.Mock };
  let request: { method: string; url: string };

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    request = { method: 'GET', url: '/api/reports/123' };
    jest.spyOn(require('@nestjs/common').Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('catch', () => {
    it('passes through a machine-readable code from the exception body', () => {
      const exception = new ForbiddenException({ statusCode: 403, message: 'nope', code: 'CONSENT_REQUIRED_CAMERA' });

      filter.catch(exception, buildHost(request, response));

      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'nope', code: 'CONSENT_REQUIRED_CAMERA' }),
      );
    });

    it('preserves the status and message of an HttpException', () => {
      const exception = new BadRequestException('Invalid assessment type');

      filter.catch(exception, buildHost(request, response));

      expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          path: '/api/reports/123',
          message: 'Invalid assessment type',
        }),
      );
    });

    it('preserves a structured message body (e.g. ZodValidationPipe field errors)', () => {
      const exception = new HttpException(
        { message: 'Validation failed', errors: [{ path: 'email', message: 'Invalid email' }] },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, buildHost(request, response));

      const body = response.json.mock.calls[0][0];
      expect(body.message).toBe('Validation failed');
    });

    it('maps a non-HttpException to a generic 500 without leaking its message', () => {
      // The thrown error's real message/stack must never reach the client —
      // only the logger sees it. This is the boundary that stops an internal
      // error (which could reference a query, a file path, or user data) from
      // being exposed in an API response.
      const exception = new Error('ECONNREFUSED 127.0.0.1:5432 — password for user "aidoctor"');

      filter.catch(exception, buildHost(request, response));

      expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      const body = response.json.mock.calls[0][0];
      expect(body.message).toBe('Internal server error');
      expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
      expect(JSON.stringify(body)).not.toContain('password');
    });

    it('always returns the {statusCode, path, timestamp, message} shape', () => {
      filter.catch(new BadRequestException('bad'), buildHost(request, response));

      const body = response.json.mock.calls[0][0];
      expect(Object.keys(body).sort()).toEqual(['message', 'path', 'statusCode', 'timestamp']);
      expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
    });

    it('logs a 5xx and a non-HttpException, but does not log a plain 4xx', () => {
      const logSpy = jest.spyOn(require('@nestjs/common').Logger.prototype, 'error');

      filter.catch(new BadRequestException('bad input'), buildHost(request, response));
      expect(logSpy).not.toHaveBeenCalled();

      filter.catch(new Error('boom'), buildHost(request, response));
      expect(logSpy).toHaveBeenCalled();
    });
  });
});
