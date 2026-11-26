'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { SignupSchema, type SignupInput } from '@aidoctor/shared';

import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { ClientApiError } from '@/lib/api/client-fetch';
import { useSignup } from '@/lib/auth/use-auth';

export default function SignupPage() {
  const router = useRouter();
  const signup = useSignup();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(SignupSchema),
    defaultValues: {
      consentCamera: false,
      consentMicrophone: false,
      consentAiProcessing: false,
      confirmedAdult: false as unknown as true,
      acceptedTerms: false as unknown as true,
    },
  });

  const consentCamera = watch('consentCamera');
  const consentMicrophone = watch('consentMicrophone');
  const consentAiProcessing = watch('consentAiProcessing');
  const confirmedAdult = watch('confirmedAdult');
  const acceptedTerms = watch('acceptedTerms');

  const onSubmit = handleSubmit(async (values) => {
    try {
      const trimmedValues = {
        ...values,
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        password: values.password.trim(),
        confirmPassword: values.confirmPassword.trim(),
      };

      await signup.mutateAsync(trimmedValues);
      router.push('/onboarding/health-profile');
    } catch (error) {
      if (error instanceof ClientApiError) {
        setError('root', { message: error.message });
      }
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Start your guided wellness assessment.</CardDescription>
      </CardHeader>
      <CardContent className="pb-6">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
            <Input
              id="fullName"
              autoComplete="name"
              {...register('fullName', { setValueAs: (value) => String(value ?? '').trim() })}
            />
          </FormField>

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
            label="Confirm password"
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

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              Some assessments use your camera or microphone. You can change these later, and nothing is
              captured without asking again first.
            </p>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={consentCamera}
                onCheckedChange={(checked) => setValue('consentCamera', checked === true)}
              />
              I consent to camera access for visual assessments
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={consentMicrophone}
                onCheckedChange={(checked) => setValue('consentMicrophone', checked === true)}
              />
              I consent to microphone access for voice assessments
            </label>
            {/* Consent wording: needs review by the privacy owner. Optional and unchecked by default. */}
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={consentAiProcessing}
                onCheckedChange={(checked) => setValue('consentAiProcessing', checked === true)}
              />
              <span>
                I agree that my answers, photos and chat messages are sent to Anthropic (USA) so the AI can
                analyse them and reply. I can withdraw this at any time in Settings. (Optional.)
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={confirmedAdult}
                onCheckedChange={(checked) => setValue('confirmedAdult', (checked === true) as true)}
              />
              I am 18 or older
            </label>
            {errors.confirmedAdult ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.confirmedAdult.message}
              </p>
            ) : null}
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={acceptedTerms}
                onCheckedChange={(checked) => setValue('acceptedTerms', (checked === true) as true)}
              />
              <span>
                I accept the{' '}
                <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
                  terms
                </Link>{' '}
                and{' '}
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
                  privacy policy
                </Link>
                , and understand this app provides wellness self-checks only and is not a medical service
              </span>
            </label>
            {errors.acceptedTerms ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.acceptedTerms.message}
              </p>
            ) : null}
          </div>

          {errors.root ? <Alert variant="error">{errors.root.message}</Alert> : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
