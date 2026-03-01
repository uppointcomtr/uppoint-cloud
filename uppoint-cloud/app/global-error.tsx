"use client";

import { useEffect } from "react";

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

  return (
    <html lang="tr">
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
            Beklenmeyen bir hata oluştu
          </h1>
          <p style={{ color: "#a3a3a3", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            {error.digest ? `Hata kodu: ${error.digest}` : "Lütfen sayfayı yenileyin veya daha sonra tekrar deneyin."}
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
            Tekrar dene
          </button>
        </div>
      </body>
    </html>
  );
}
