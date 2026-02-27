# Uppoint Cloud Foundation

Bootstrap foundation for `cloud.uppoint.com.tr` with a production-oriented
baseline:

- Next.js (App Router, TypeScript, strict mode)
- shadcn/ui
- Prisma + Managed PostgreSQL connection model
- Zod-based environment validation
- React Hook Form and Zod resolver dependencies

## Prerequisites

- Node.js `22.x`
- npm `10+`

## Environment

Copy `.env.example` to `.env` and set real values:

```bash
cp .env.example .env
```

Required variables:

- `NEXT_PUBLIC_APP_URL`
- `DATABASE_URL`

## Commands

```bash
npm install
npm run prisma:generate
npm run dev
```

Verification commands:

```bash
npm run lint
npm run typecheck
npm run build
```
