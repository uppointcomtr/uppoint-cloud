"use client";

import { useEffect, useMemo } from "react";

import { getErrorMessages, resolveLocaleFromPathname } from "@/modules/i18n/error-messages";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Catches errors thrown inside app/layout.tsx itself.
// Must include its own <html> and <body> since the root layout is unavailable.
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  const locale = useMemo(
    () => resolveLocaleFromPathname(typeof window !== "undefined" ? window.location.pathname : null),
    [],
  );
  const dictionary = getErrorMessages(locale);

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            {dictionary.unexpectedErrorTitle}
          </h1>
          <p style={{ color: "#a3a3a3", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            {error.digest
              ? `${dictionary.codePrefix}: ${error.digest}`
              : dictionary.fallbackDescription}
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.375rem",
              border: "none",
              backgroundColor: "#059669",
              color: "#fff",
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
          >
            {dictionary.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
