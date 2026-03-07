export default function DashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8" aria-busy="true" aria-live="polite">
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-2xl border border-border/70 bg-card/70" />
        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <div className="h-[520px] animate-pulse rounded-2xl border border-border/70 bg-card/70" />
          <div className="space-y-4">
            <div className="h-44 animate-pulse rounded-2xl border border-border/70 bg-card/70" />
            <div className="h-44 animate-pulse rounded-2xl border border-border/70 bg-card/70" />
            <div className="h-44 animate-pulse rounded-2xl border border-border/70 bg-card/70" />
          </div>
        </div>
      </div>
    </main>
  );
}
