export function AuthBackgroundMotif() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl dark:bg-primary/18" />
      <div className="absolute -right-20 bottom-8 h-64 w-64 rounded-full bg-primary/8 blur-3xl dark:bg-primary/14" />
      <div className="absolute inset-0 [background-image:repeating-linear-gradient(125deg,hsl(0_0%_0%/.02)_0_1px,transparent_1px_13px)] dark:[background-image:repeating-linear-gradient(125deg,hsl(0_0%_100%/.04)_0_1px,transparent_1px_13px)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_30%,hsl(0_0%_0%/.03)_100%)] dark:bg-[radial-gradient(circle_at_50%_50%,transparent_30%,hsl(0_0%_100%/.03)_100%)]" />
    </div>
  );
}
