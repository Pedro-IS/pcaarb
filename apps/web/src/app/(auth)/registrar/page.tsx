'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useForm } from 'react-hook-form';
import { registerTenantSchema, type AuthTokens, type RegisterTenantInput } from '@pcaarb/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function RegisterPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<RegisterTenantInput>({ resolver: zodResolver(registerTenantSchema) });

  const mutation = useMutation({
    mutationFn: (input: RegisterTenantInput) =>
      apiFetch<AuthTokens>('/auth/register', { method: 'POST', body: input }),
    onSuccess: (tokens) => {
      localStorage.setItem('pcaarb_access_token', tokens.accessToken);
      localStorage.setItem('pcaarb_refresh_token', tokens.refreshToken);
      router.push('/painel');
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setError('root', { message: error.message });
      }
    },
  });

  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-16"
    >
      <div>
        <p className="text-sm font-semibold tracking-tight text-accent">PCAARB</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="mt-1 text-sm text-muted">
          Start selling today — {process.env.NEXT_PUBLIC_TRIAL_DAYS ?? '14'} days free.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <Field label="Company name" error={errors.companyName?.message}>
          <Input {...register('companyName')} />
        </Field>

        <Field label="CPF or CNPJ (numbers only)" error={errors.document?.message}>
          <Input {...register('document')} />
        </Field>

        <Field label="Your name" error={errors.ownerName?.message}>
          <Input {...register('ownerName')} />
        </Field>

        <Field label="Your email" error={errors.ownerEmail?.message}>
          <Input type="email" autoComplete="email" {...register('ownerEmail')} />
        </Field>

        <Field label="Password" error={errors.password?.message}>
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </Field>

        {errors.root && <p className="text-sm text-red-600">{errors.root.message}</p>}

        <Button type="submit" loading={mutation.isPending}>
          Create free account
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </motion.main>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
