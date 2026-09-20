import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';

const email = z.string().trim().toLowerCase().max(191).email('Enter a valid email address.');
const phone = z.string().trim().max(40)
  .transform(value => value.replace(/[\s().-]/g, ''))
  .transform(value => /^0\d{10}$/.test(value) ? `+234${value.slice(1)}` : value)
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter an international phone number, or an 11-digit Nigerian number.'));
const password = z.string().min(12, 'Use at least 12 characters.')
  .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Use at most 72 UTF-8 bytes.')
  .regex(/[a-z]/, 'Include a lowercase letter.').regex(/[A-Z]/, 'Include an uppercase letter.')
  .regex(/\d/, 'Include a number.').regex(/[^\w\s]/, 'Include a symbol.');

export const registrationSchema = z.strictObject({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(150)
    .refine(value => !/[\p{Cc}\p{Cf}]/u.test(value), 'Enter a valid full name.'),
  email, phone, password, confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1, 'Enter your password.')
    .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long.'),
});

export function validateBody(schema) {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      const error = new ApiError(422, 'Please check the form and try again.');
      error.fields = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] ?? '_form';
        error.fields[field] ??= issue.code === 'unrecognized_keys' ? 'Unexpected fields supplied.' : issue.message;
      }
      return next(error);
    }
    request.validated = result.data;
    return next();
  };
}
