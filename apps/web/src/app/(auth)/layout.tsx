'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

// Shared shell for every auth screen (login, register, forgot/reset
// password, accept invite) — previously each page duplicated this same
// centered-column + entrance-animation wrapper independently. Also gives
// auth pages a way back to the marketing site, which didn't exist before.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6 py-16"
    >
      <Link href="/" className="flex items-center gap-2 self-start">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-accent-foreground">
          P
        </span>
        <span className="text-sm font-semibold tracking-tight">PCAARB</span>
      </Link>
      {children}
    </motion.main>
  );
}
