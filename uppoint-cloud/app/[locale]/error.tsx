"use client";

import { useEffect } from "react";
import Link from "next/link";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Catches runtime errors thrown in any page or layout within app/[locale]/.
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Hata
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Bir şeyler yanlış gitti</h1>
        <p className="text-muted-foreground">
          {error.digest
            ? `Hata kodu: ${error.digest}`
            : "Beklenmedik bir hata oluştu. Lütfen tekrar deneyin."}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Tekrar dene
        </button>
        <Link
          href="/"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Ana sayfaya dön
        </Link>
      </div>
    </div>
  );
}
