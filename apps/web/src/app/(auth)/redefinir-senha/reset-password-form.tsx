'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { resetPasswordSchema, type ResetPasswordInput } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const token = searchParams.get('token') ?? '';

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { id, token },
  });

  const mutation = useMutation({
    mutationFn: (input: ResetPasswordInput) => apiFetch('/auth/reset-password', { method: 'POST', body: input }),
    onSuccess: () => router.push('/login'),
    onError: (error) => {
      if (error instanceof ApiError) {
        setError('root', { message: error.message });
      }
    },
  });

  if (!id || !token) {
    return (
      <>
        <p className="text-sm text-danger">Invalid reset link. Request a new one from &quot;Forgot my password&quot;.</p>
        <Link href="/esqueci-senha" className="text-sm font-medium text-accent hover:underline">
          Forgot my password
        </Link>
      </>
    );
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Choose new password</h1>
        <p className="mt-1 text-sm text-muted">Your current sessions will be ended after the change.</p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => mutation.mutate({ ...values, id, token }))}
      >
        <input type="hidden" {...register('id')} />
        <input type="hidden" {...register('token')} />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">New password</label>
          <Input type="password" autoComplete="new-password" {...register('password')} />
          {errors.password && <p className="text-sm text-danger">{errors.password.message}</p>}
        </div>

        {errors.root && <p className="text-sm text-danger">{errors.root.message}</p>}

        <Button type="submit" loading={mutation.isPending}>
          Reset password
        </Button>
      </form>
    </>
  );
}
