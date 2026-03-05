export default function DashboardLoading() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-20 animate-pulse rounded-2xl border border-border/60 bg-card/60" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="h-36 animate-pulse rounded-xl border border-border/60 bg-card/60" />
        <div className="h-36 animate-pulse rounded-xl border border-border/60 bg-card/60" />
        <div className="h-36 animate-pulse rounded-xl border border-border/60 bg-card/60" />
        <div className="h-36 animate-pulse rounded-xl border border-border/60 bg-card/60" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl border border-border/60 bg-card/60" />
        <div className="h-64 animate-pulse rounded-xl border border-border/60 bg-card/60" />
      </div>
    </div>
  );
}
