'use client';

import { useState } from 'react';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { ForgotPasswordSchema, type ForgotPasswordInput } from '@aidoctor/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { useForgotPassword } from '@/lib/auth/use-auth';

export default function ForgotPasswordPage() {
  const forgotPassword = useForgotPassword();
  const [devResetToken, setDevResetToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(ForgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    const trimmedValues = {
      ...values,
      email: values.email.trim(),
    };

    const result = await forgotPassword.mutateAsync(trimmedValues);
    setDevResetToken(result.devResetToken ?? null);
  });

  if (forgotPassword.isSuccess) {
    return (
      <Card>
        <CardHeader className={devResetToken ? undefined : 'pb-6'}>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            If an account exists for {getValues('email')}, we&apos;ve sent a password reset link.
          </CardDescription>
        </CardHeader>
        {devResetToken ? (
          <CardContent className="space-y-2 pb-6">
            <p className="text-xs text-muted-foreground">
              No email provider is configured yet, so here&apos;s your reset link for local testing:
            </p>
            <Link
              href={`/reset-password?token=${devResetToken}&email=${encodeURIComponent(getValues('email'))}`}
              className="block break-all text-sm text-primary underline-offset-4 hover:underline"
            >
              Reset your password
            </Link>
          </CardContent>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot your password?</CardTitle>
        <CardDescription>Enter your email and we&apos;ll send you a reset link.</CardDescription>
      </CardHeader>
      <CardContent className="pb-6">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
          </FormField>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
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
