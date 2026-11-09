"use client";

import * as React from "react";
import { Suspense, useActionState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { login, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// `next` is read from the query string, so this half has to sit behind a
// Suspense boundary or the page can't be prerendered.
function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/admin";
  const [state, formAction, pending] = useActionState<LoginState | undefined, FormData>(
    login,
    undefined,
  );

  return (
    <form
      action={formAction}
      className="rounded-lg border border-border bg-card p-6 shadow-sm"
    >
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Lock className="size-4 text-primary" />
        Enter the shop passphrase
      </div>

      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5">
        <Label htmlFor="passphrase">Passphrase</Label>
        <Input
          id="passphrase"
          name="passphrase"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
        />
      </div>

      {state?.error && <p className="mt-3 text-sm text-destructive">{state.error}</p>}

      <Button type="submit" className="mt-5 w-full" disabled={pending}>
        {pending ? "Checking…" : "Unlock"}
      </Button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Image
            src="/images/secretstockjpg.jpg"
            alt="Secret Stock TX"
            width={56}
            height={56}
            className="mx-auto size-14 rounded-xl object-cover ring-1 ring-primary/40"
            priority
          />
          <p className="mt-2 font-display text-sm font-bold gradient-text">
            Secret Stock TX
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Store Admin
          </p>
        </div>

        <Suspense
          fallback={
            <div className="h-56 animate-pulse rounded-lg border border-border bg-card" />
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
