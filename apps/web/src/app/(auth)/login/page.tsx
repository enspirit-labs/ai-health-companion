'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { LoginSchema, type LoginInput } from '@aidoctor/shared';

import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { ClientApiError } from '@/lib/api/client-fetch';
import { useLogin } from '@/lib/auth/use-auth';
import { hardNavigate, safeRedirectPath } from '@/lib/navigation';

function LoginForm() {
  const searchParams = useSearchParams();
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    setValue,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) });

  const passwordRegister = register('password', {
    setValueAs: (value) => String(value ?? '').trim(),
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const trimmedValues = {
        ...values,
        email: values.email.trim(),
        password: values.password.trim(),
      };

      await login.mutateAsync(trimmedValues);
      // Full navigation, not router.push: a fresh page load guarantees nothing
      // from a previous user in this tab (router cache, in-memory state) is reused.
      hardNavigate(safeRedirectPath(searchParams.get('redirectTo')));
    } catch (error) {
      if (error instanceof ClientApiError) {
        setError('root', { message: error.message });
      }
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Sign in to continue your wellness journey.</CardDescription>
      </CardHeader>
      <CardContent className="pb-6">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...register('email', { setValueAs: (value) => String(value ?? '').trim() })}
            />
          </FormField>

          <FormField label="Password" htmlFor="password" error={errors.password?.message}>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-10"
                {...passwordRegister}
                onBlur={(event) => {
                  const trimmed = event.currentTarget.value.trim();
                  event.currentTarget.value = trimmed;
                  setValue('password', trimmed, { shouldValidate: true, shouldDirty: true });
                  passwordRegister.onBlur(event);
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

          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          </div>

          {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
