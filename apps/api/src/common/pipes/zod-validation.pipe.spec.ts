import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    email: z.string().email(),
    age: z.number().int().min(0),
  });

  describe('transform', () => {
    it('returns the parsed value when it satisfies the schema', () => {
      const pipe = new ZodValidationPipe(schema);

      expect(pipe.transform({ email: 'a@b.com', age: 30 })).toEqual({
        email: 'a@b.com',
        age: 30,
      });
    });

    it('strips unknown-to-zod coercion and returns exactly the parsed shape', () => {
      const pipe = new ZodValidationPipe(schema);

      const result = pipe.transform({ email: 'a@b.com', age: 30 });

      expect(Object.keys(result)).toEqual(['email', 'age']);
    });

    it('throws BadRequestException with a per-field {path, message}[] shape on invalid input', () => {
      // apps/web's ClientApiError.fieldErrors is built directly from this
      // errors[] shape — changing it here is a breaking change for every
      // caller that renders field-level validation errors.
      const pipe = new ZodValidationPipe(schema);

      try {
        pipe.transform({ email: 'not-an-email', age: -1 });
        throw new Error('expected transform to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse() as {
          message: string;
          errors: { path: string; message: string }[];
        };
        expect(response.message).toBe('Validation failed');
        expect(response.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ path: 'email' }), expect.objectContaining({ path: 'age' })]),
        );
      }
    });

    it('joins nested paths with a dot', () => {
      const nested = z.object({ user: z.object({ name: z.string() }) });
      const pipe = new ZodValidationPipe(nested);

      try {
        pipe.transform({ user: { name: 123 } });
        throw new Error('expected transform to throw');
      } catch (err) {
        const response = (err as BadRequestException).getResponse() as {
          errors: { path: string; message: string }[];
        };
        expect(response.errors[0].path).toBe('user.name');
      }
    });
  });
});
