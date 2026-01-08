# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a modern TypeScript monorepo built with Better-T-Stack, combining TanStack Start (SSR framework), ORPC (type-safe RPC), Drizzle ORM with PostgreSQL, and shadcn/ui components. The project uses Turborepo for monorepo orchestration and Bun as the package manager.

## Development Commands

**Installation:**
```bash
bun install
```

**Development:**
```bash
bun run dev              # Start all apps in development mode
bun run dev:web          # Start only the web app (port 3001)
```

**Building:**
```bash
bun run build            # Build all apps
bun run check-types      # Type check across all apps
```

**Database:**
```bash
bun run db:push          # Push schema changes to PostgreSQL
bun run db:studio        # Open Drizzle Studio UI
bun run db:generate      # Generate migration files
bun run db:migrate       # Run migrations
```

## Architecture

### Monorepo Structure

- `apps/web/` - TanStack Start SSR application (React 19, Vite, port 3001)
- `packages/api/` - ORPC API layer with routers and procedures
- `packages/db/` - Drizzle ORM schemas and database client
- `packages/env/` - Environment variable validation (using @t3-oss/env-core and Zod)
- `packages/config/` - Shared TypeScript config

### Type-Safe RPC with ORPC

The project uses ORPC for end-to-end type-safe APIs between client and server:

**Server-side routers** are defined in `packages/api/src/routers/`:
- Routers export `appRouter` object with procedures
- Use `publicProcedure` from `packages/api/src/index.ts`
- Context is created via `createContext()` in `packages/api/src/context.ts`

**Client-side integration** in `apps/web/src/utils/orpc.ts`:
- Isomorphic client switches between direct router calls (SSR) and HTTP RPC calls (CSR)
- Integrated with TanStack Query via `createTanstackQueryUtils`
- Global query error handling with toast notifications

**API routes** are handled in `apps/web/src/routes/api/rpc/$.ts`:
- Serves both RPC endpoints (`/api/rpc`) and OpenAPI reference (`/api/rpc/api-reference`)
- Uses RPCHandler and OpenAPIHandler with Zod schema conversion

### Database Layer

**Configuration:** `packages/db/drizzle.config.ts` reads `.env` from `apps/web/.env`

**Connection:** Database client is initialized in `packages/db/src/index.ts` using `DATABASE_URL` from env

**Schemas:** Define tables in `packages/db/src/schema/`

### Environment Variables

Managed through `packages/env/` with runtime validation:
- `server.ts` - Server-only vars (DATABASE_URL, CORS_ORIGIN, NODE_ENV)
- `web.ts` - Client-safe vars
- Uses Zod for validation via @t3-oss/env-core

Required variables in `apps/web/.env`:
```
DATABASE_URL=postgresql://...
CORS_ORIGIN=http://localhost:3001
NODE_ENV=development
```

### Routing

TanStack Router with file-based routing in `apps/web/src/routes/`:
- `__root.tsx` - Root layout
- `index.tsx` - Home page
- `api/` - API route handlers
- Route tree is auto-generated in `routeTree.gen.ts`

### UI Components

- TailwindCSS 4.x with Vite plugin
- shadcn/ui components (already installed per package.json)
- Base UI components from @base-ui/react
- Theming via next-themes
- Notifications via sonner

### AI Integration

The project includes Vercel AI SDK integration:
- @ai-sdk/google for LLM providers
- @ai-sdk/react for React hooks
- @ai-sdk/devtools for debugging
- streamdown for markdown streaming
- AI routes in `apps/web/src/routes/api/ai/`

## Key Patterns

**Adding API endpoints:**
1. Define procedures in `packages/api/src/routers/index.ts` or create new router files
2. Export from `appRouter` object
3. Type safety flows automatically to client via `AppRouter` type

**Using API on client:**
```typescript
import { orpc } from "~/utils/orpc";

// TanStack Query hooks auto-generated:
const { data } = orpc.healthCheck.useQuery();
```

**Database queries:**
1. Define schema in `packages/db/src/schema/`
2. Run `bun run db:push` to sync with PostgreSQL
3. Import `db` from `@leads/db` in API routers
4. Use Drizzle ORM query builder

**Environment variables:**
1. Add to appropriate env config in `packages/env/src/`
2. Reference via `import { env } from "@leads/env/server"` or `@leads/env/web`
3. Zod validates at runtime on startup
