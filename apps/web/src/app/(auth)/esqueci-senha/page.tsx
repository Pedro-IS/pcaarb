'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@pcaarb/shared';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const mutation = useMutation({
    // Always "succeeds" from the frontend's point of view, whether or not the
    // e-mail exists — same anti-enumeration discipline as the backend (see AuthService).
    mutationFn: (input: ForgotPasswordInput) => apiFetch('/auth/forgot-password', { method: 'POST', body: input }),
    onSuccess: () => setSent(true),
    onError: () => setSent(true),
  });

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Forgot my password</h1>
        <p className="mt-1 text-sm text-muted">Enter your account email to receive a reset link.</p>
      </div>

      {sent ? (
        <p className="text-sm">
          If an account exists with that email, we&apos;ve sent a reset link — check your inbox (and your spam
          folder).
        </p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
            {errors.email && <p className="text-sm text-danger">{errors.email.message}</p>}
          </div>

          <Button type="submit" loading={mutation.isPending}>
            Send reset link
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-accent hover:underline">
          Back to login
        </Link>
      </p>
    </>
  );
}
