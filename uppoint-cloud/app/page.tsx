import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          cloud.uppoint.com.tr
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Foundation Bootstrap Ready
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Next.js App Router, Prisma, environment validation, and shadcn/ui are
          initialized for production-oriented development.
        </p>
      </div>
      <div>
        <Button type="button" variant="outline" disabled>
          Core setup complete
        </Button>
      </div>
    </main>
  );
}
