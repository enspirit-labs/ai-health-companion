'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { ResetPasswordSchema, type ResetPasswordInput } from '@aidoctor/shared';

import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { ClientApiError } from '@/lib/api/client-fetch';
import { useResetPassword } from '@/lib/auth/use-auth';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetPassword = useResetPassword();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const {
    register,
    setValue,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: {
      email: searchParams.get('email') ?? '',
      token: searchParams.get('token') ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const trimmedValues = {
        ...values,
        password: values.password.trim(),
        confirmPassword: values.confirmPassword.trim(),
      };

      await resetPassword.mutateAsync(trimmedValues);
      router.push('/login');
    } catch (error) {
      if (error instanceof ClientApiError) {
        setError('root', { message: error.message });
      }
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent className="pb-6">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <input type="hidden" {...register('email')} />
          <input type="hidden" {...register('token')} />

          <FormField label="New password" htmlFor="password" error={errors.password?.message}>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className="pr-10"
                {...register('password', { setValueAs: (value) => String(value ?? '').trim() })}
                onBlur={(event) => {
                  const trimmed = event.currentTarget.value.trim();
                  event.currentTarget.value = trimmed;
                  setValue('password', trimmed, { shouldValidate: true, shouldDirty: true });
                }}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FormField>

          <FormField
            label="Confirm new password"
            htmlFor="confirmPassword"
            error={errors.confirmPassword?.message}
          >
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className="pr-10"
                {...register('confirmPassword', { setValueAs: (value) => String(value ?? '').trim() })}
                onBlur={(event) => {
                  const trimmed = event.currentTarget.value.trim();
                  event.currentTarget.value = trimmed;
                  setValue('confirmPassword', trimmed, { shouldValidate: true, shouldDirty: true });
                }}
              />
              <button
                type="button"
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                title={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                className="absolute inset-y-0 right-0 flex cursor-pointer items-center pr-3 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FormField>

          {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Resetting…' : 'Reset password'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
