'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Button } from './button';
import {
  AppleIcon,
  AtSignIcon,
  ChevronLeftIcon,
  GithubIcon,
  Grid2x2PlusIcon,
} from 'lucide-react';
import { Input } from './input';
import { cn } from '@/lib/utils';

export function AuthPage() {
  return (
    <div className="relative min-h-screen w-full flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-foreground/[0.03]">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-2">
            <Grid2x2PlusIcon className="h-6 w-6 text-foreground" />
            <span className="text-xl font-bold text-foreground">Asme</span>
          </div>

          <div className="max-w-md">
            <blockquote className="text-lg italic text-foreground/80 leading-relaxed">
              "This Platform has helped me to save time and serve my
              clients faster than ever before."
            </blockquote>
            <p className="mt-4 text-sm text-muted-foreground">
              ~ Ali Hassan
            </p>
          </div>

          <div className="flex gap-2">
            <div className="h-1 w-8 rounded-full bg-foreground/20" />
            <div className="h-1 w-8 rounded-full bg-foreground" />
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background relative">
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <div className="flex gap-1">
            <div className="h-2 w-2 rounded-full bg-destructive" />
            <div className="h-2 w-2 rounded-full bg-warning" />
            <div className="h-2 w-2 rounded-full bg-success" />
          </div>
        </div>

        <Button variant="ghost" size="sm" className="absolute top-4 right-4" asChild>
          <a href="/">
            <ChevronLeftIcon className="h-4 w-4 mr-1" />
            Home
          </a>
        </Button>

        <div className="w-full max-w-sm space-y-8">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <Grid2x2PlusIcon className="h-6 w-6 text-foreground" />
              <span className="text-xl font-bold text-foreground">Asme</span>
            </div>

            <div className="text-center space-y-1 mt-4">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Sign In or Join Now!
              </h1>
              <p className="text-sm text-muted-foreground">
                login or create your asme account.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Button variant="outline" className="w-full justify-center gap-2">
              <GoogleIcon className="h-4 w-4" />
              Continue with Google
            </Button>
            <Button variant="outline" className="w-full justify-center gap-2">
              <AppleIcon className="h-4 w-4" />
              Continue with Apple
            </Button>
            <Button variant="outline" className="w-full justify-center gap-2">
              <GithubIcon className="h-4 w-4" />
              Continue with GitHub
            </Button>
          </div>

          <AuthSeparator />

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Enter your email address to sign in or create an account
            </p>

            <div className="relative">
              <Input
                placeholder="@example.com"
                className="peer ps-9"
                type="email"
              />
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
                <AtSignIcon size={16} strokeWidth={2} aria-hidden="true" />
              </div>
            </div>

            <Button className="w-full">
              Continue With Email
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            By clicking continue, you agree to our{' '}
            <a href="#" className="underline hover:text-foreground">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className="underline hover:text-foreground">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    color: `rgba(15,23,42,${0.1 + i * 0.03})`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg className="w-full h-full" viewBox="0 0 696 316" fill="none">
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke={path.color}
            strokeWidth={path.width}
            strokeOpacity={0.1 + path.id * 0.02}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.3, 0.6, 0.3],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        ))}
      </svg>
    </div>
  );
}

const GoogleIcon = (props: React.ComponentProps<'svg'>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
    <title>Google</title>
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const AuthSeparator = () => {
  return (
    <div className="relative flex items-center gap-4">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground uppercase">OR</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
};
