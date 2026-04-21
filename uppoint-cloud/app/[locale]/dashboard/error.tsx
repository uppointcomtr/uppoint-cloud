"use client";

import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";

const COPY = {
  tr: {
    title: "Gösterge paneli geçici olarak yüklenemedi",
    description: "İstek işlenirken bir hata oluştu. Sayfayı yeniden deneyin.",
    action: "Tekrar dene",
  },
  en: {
    title: "Dashboard is temporarily unavailable",
    description: "An error occurred while loading dashboard data. Please try again.",
    action: "Try again",
  },
} as const;

function resolveLocale(value: string | string[] | undefined): keyof typeof COPY {
  const locale = Array.isArray(value) ? value[0] : value;
  return locale === "en" ? "en" : "tr";
}

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const locale = resolveLocale(params?.locale);
  const copy = COPY[locale];

  return (
    <main className="corp-dashboard-shell max-w-3xl items-center justify-center">
      <section className="corp-surface w-full p-6 text-center">
        <h1 className="corp-heading-2">{copy.title}</h1>
        <p className="corp-body-muted mt-2">{copy.description}</p>
        <div className="mt-5">
          <Button type="button" className="corp-btn-md" onClick={reset}>
            {copy.action}
          </Button>
        </div>
      </section>
    </main>
  );
}
