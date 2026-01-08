# Persona Ranker - Lead Qualification & Ranking System

An AI-powered lead qualification and ranking system that identifies the best contacts at target companies based on an ideal customer persona. Built for the Throxy technical challenge.

## Tech Stack

- **Frontend**: TanStack Start (SSR), React 19, TanStack Router, TanStack Query, TanStack Table
- **Backend**: ORPC (type-safe RPC), Service layer architecture
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: OpenRouter (GPT-5-mini for all AI tasks)
- **Background Jobs**: Trigger.dev (async task execution)
- **State Management**: Jotai (client state), TanStack Query (server state)
- **UI**: shadcn/ui components, TailwindCSS 4.x
- **Monorepo**: Turborepo + Bun workspaces

## Prerequisites

- **Bun** >= 1.3.3 ([install](https://bun.sh))
- **PostgreSQL** database (local or hosted)
- **OpenRouter API key**
- **Trigger.dev account** (optional - can run synchronously in dev mode)

## Getting Started

### 1. Install Dependencies

```bash
bun install
```

### 2. Environment Setup

The project requires environment variables in **3 locations** (due to SSR and Trigger.dev task execution):

```bash
# Copy example to all required locations
cp .env.example .env
cp .env.example apps/web/.env
cp .env.example packages/api/.env
```

Then update each file with your actual values:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/leads
NODE_ENV=development
CORS_ORIGIN=http://localhost:3001

# AI - OpenRouter
OPENROUTER_API_KEY=sk-or-...

# Optional: Override default models (all default to openai/gpt-5-mini)
# OPENROUTER_QUALIFICATION_MODEL=openai/gpt-5-mini
# OPENROUTER_RANKING_MODEL=openai/gpt-5-mini
# OPENROUTER_GRADIENT_MODEL=openai/gpt-5-mini
# OPENROUTER_VARIANT_MODEL=openai/gpt-5-mini

# Background Jobs - Trigger.dev
TRIGGER_API_KEY=tr_dev_...
TRIGGER_SECRET_KEY=tr_dev_...
USE_TRIGGER_QUEUES=false  # Set to 'true' for async execution
```

**Why 3 .env files?**
- `/.env` - Root reference (loaded by drizzle.config.ts)
- `/apps/web/.env` - Loaded by Vite for SSR (server-side rendering needs DB/AI access)
- `/packages/api/.env` - Loaded by Trigger.dev tasks when running background jobs

### 3. Database Setup

Create your PostgreSQL database, then push the schema:

```bash
bun run db:push
```

Seed the database with evaluation data and baseline prompt (required):

```bash
bun run seed
```

### 4. Trigger.dev Configuration (Optional - For Your Own Account)

If you want to use your own Trigger.dev account instead of the default project, update the project ID in two files:

1. **`packages/api/package.json`** - Update the `endpointId`:
   ```json
   "trigger.dev": {
     "endpointId": "proj_YOUR_PROJECT_ID"
   }
   ```

2. **`packages/api/trigger.config.ts`** - Update the `project` field:
   ```typescript
   export default defineConfig({
     project: "proj_YOUR_PROJECT_ID",
     // ... rest of config
   });
   ```

Get your project ID from your [Trigger.dev dashboard](https://trigger.dev).

**Note**: The app works without this change - it will use the default project ID. You only need to update this if you want to connect to your own Trigger.dev account.

### 5. Run Development Server

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) to see the application.

**Alternative**: Run web app only (without trigger.dev):
```bash
bun run dev:web
```

## Architecture Overview

### Monorepo Structure

```
leads/
├── apps/
│   └── web/                    # TanStack Start SSR application
│       ├── src/
│       │   ├── routes/         # File-based routing (TanStack Router)
│       │   ├── pages/          # Page components with feature folders
│       │   │   ├── home/       # Home page: CSV upload, leads table
│       │   │   └── prompt/     # Prompt optimization page
│       │   ├── components/     # Shared UI components (shadcn/ui)
│       │   ├── hooks/          # Global custom hooks
│       │   └── utils/          # ORPC client, utilities
│       └── .env
│
├── packages/
│   ├── api/                    # Backend logic & AI orchestration
│   │   ├── src/
│   │   │   ├── routers/        # ORPC API endpoints
│   │   │   ├── services/       # Business logic (singleton pattern)
│   │   │   ├── agents/         # AI agents (qualification, ranking, optimization)
│   │   │   ├── schemas/        # Zod validation schemas
│   │   │   ├── trigger/        # Trigger.dev background tasks
│   │   │   ├── config/         # Constants and configuration
│   │   │   └── utils/          # Helper utilities, error classes, logging
│   │   └── .env
│   │
│   ├── db/                     # Database layer
│   │   ├── src/
│   │   │   ├── schema/         # Drizzle ORM table definitions
│   │   │   ├── migrations/     # Database migration files
│   │   │   └── scripts/        # Seed scripts
│   │   └── drizzle.config.ts
│   │
│   ├── env/                    # Environment variable validation
│   │   └── src/
│   │       ├── server.ts       # Server-side env vars (Zod validated)
│   │       └── web.ts          # Client-safe env vars
│   │
│   └── config/                 # Shared TypeScript configuration
│       └── tsconfig.base.json
│
├── .env                        # Root environment file
└── .env.example               # Environment template
```

### Data Flow

```
User Action (CSV Upload, Ranking Trigger)
    ↓
Frontend (React Component)
    ↓
Custom Hook (useCsvUpload, useRankingJob)
    ↓
ORPC Client (Type-safe RPC call)
    ↓
ORPC Router (API endpoint)
    ↓
Service Layer (Business logic)
    ↓
Task Executor (Sync or Async decision)
    ↓
AI Agent (Qualification/Ranking with retry logic)
    ↓
OpenRouter API (GPT-5-mini)
    ↓
Database (Drizzle ORM → PostgreSQL)
    ↓
Response back through chain
```

### Key Components

**Frontend Architecture**:
- **Pages** orchestrate feature components and custom hooks
- **Components** follow feature-based organization with co-located hooks/atoms
- **Hooks** return both state and actions, composable pattern
- **State**: Jotai atoms for complex cross-component state, TanStack Query for server state

**Backend Architecture**:
- **Routers** are thin - validate input/output, delegate to services
- **Services** are singletons containing business logic
- **Agents** orchestrate AI calls with retry logic, validation, and template substitution
- **Schemas** define input/output contracts with Zod validation
- **Task Executor** abstracts sync vs async execution for background jobs

## How It Works

For detailed step-by-step explanations of CSV upload processing and automatic prompt optimization, see [GUIDE.md](./GUIDE.md).

## Key Design Decisions

### 1. Two-Phase Approach: Qualification → Ranking

**Rationale**: Separate concerns for better accuracy, debugging and optimising.

- **Phase 1 - Qualification**: Binary decision (qualified/disqualified) with reasoning
  - Filters out irrelevant leads (HR for sales platform)
  - Uses GPT-5-mini model via OpenRouter
  - Validates against persona spec

- **Phase 2 - Ranking**: Ranks only qualified leads within each company
  - Groups by company for fair comparison
  - AI assigns ranks + reasoning for each lead
  - Top N leads per company can be exported

**Alternative considered**: Single-pass ranking of all leads. Rejected because:
- Easier to optimize qualification separately from ranking and vice versa
- Prevents context overload
- Harder to debug when rankings seem off


### 2. Prompt Optimization with Beam Search

**Rationale**: Automated prompt improvement using evaluation set + AI feedback.

Implemented the hard bonus challenge:
- **Evaluation set**: 50 pre-ranked leads with ground truth
- **Beam search**: Generate variants, evaluate, keep best performers
- **Gradient generation**: AI analyzes errors and suggests improvements
- **Variant generation**: AI creates improved prompts from feedback
- **Metrics**: MAE, RMSE, Spearman correlation, Kendall's Tau

**Why beam search?**
- More efficient than exhaustive search
- Explores multiple promising directions
- Balances exploitation vs exploration
- Proven effective for prompt optimization

### 3. Background Job Abstraction

**Rationale**: Dev/prod parity with sync/async execution flexibility.

```typescript
// Task executor abstracts execution mode
const result = await executeRankingWorkflow({ leadIds });

// In development (USE_TRIGGER_QUEUES=false):
// → Runs synchronously, immediate feedback

// In production (USE_TRIGGER_QUEUES=true):
// → Queues via Trigger.dev, returns job ID
```

**Benefits**:
- Fast iteration in development
- Scalable background jobs in production
- No code changes between environments
- Easy to test business logic without async complexity

### 4. OpenRouter for Model Flexibility

**Rationale**: Use OpenRouter as LLM gateway for resilience and cost optimization.

- **Model switching**: Change models via environment variables without code changes
- **Higher TPS**: OpenRouter aggregates rate limits across multiple providers
- **Provider fallback**: If one provider is down, switch to another instantly
- **Cost optimization**: Use cheaper models for simple tasks (qualification), premium for complex (ranking)

```bash
# Per-task model configuration
OPENROUTER_QUALIFICATION_MODEL=openai/gpt-5-mini
OPENROUTER_RANKING_MODEL=openai/gpt-5-mini
OPENROUTER_GRADIENT_MODEL=openai/gpt-5-mini
OPENROUTER_VARIANT_MODEL=openai/gpt-5-mini
```

**Alternative rejected**: Direct OpenAI API. Single provider = single point of failure, no rate limit aggregation.

### 5. Per-Company Ranking (Not Global)

**Rationale**: Leads ranked within their company, never compared across companies.

- A VP of Sales at a 50-person startup might be Rank 1 there
- That same title at a 5,000-person enterprise might be Rank 2 (behind VP of Sales Development)
- Company context (size, industry) fundamentally changes who the ideal buyer is

**Implementation**: Leads grouped by `companyId`, each group sent to AI separately with company-specific context (domain, employee range, industry). Cross-company comparison is meaningless for sales prioritization.

### 6. Safe Defaults on AI Failure

**Rationale**: Conservative fallback behavior prioritizes precision over recall.

| Failure Type | Fallback | Reasoning |
|--------------|----------|-----------|
| Qualification error | `qualified: false` | Don't contact unvetted leads |
| Ranking error | Empty array | Don't override existing rankings |
| Incomplete response | Retry missing leads | AI sometimes drops items from batch |

**Why conservative**: It's safer to miss a good lead than to contact an irrelevant one. Sales teams prefer fewer high-quality leads over more uncertain ones.

## Technical Tradeoffs

### 1. Monolithic Jobs vs Micro-Jobs

**Decision**: Single job per workflow (import, ranking, optimization) with internal batching rather than splitting into many small jobs.

**Why**: Splitting into micro-jobs would require:
- Distributed state management for partial progress
- Job orchestration and dependency tracking
- Complex race condition handling on shared data
- Partial failure recovery logic

**Tradeoff**: This approach prioritizes implementation simplicity and deterministic execution over fine-grained failure recovery and horizontal scalability.

**Proper solution**: Use a workflow orchestrator (e.g., Temporal, Inngest) with durable step execution and checkpointing, allowing workflows to resume from the last successful step and scale via parallel execution.

---

### 2. In-Memory CSV Processing (No Cloud Storage)

**Decision**: CSV files are parsed directly from upload into memory, then written to database. No S3/cloud storage.

**Why**: Avoids infrastructure complexity:
- No S3 bucket setup or IAM policies
- No signed URL generation for uploads
- No cleanup jobs for orphaned files
- Simpler local development

**Tradeoff**:
- Can't handle files larger than server memory
- Can't re-process or audit original uploaded files
- No file versioning or rollback capability

**Proper solution**: Upload to S3 with presigned URLs, store file reference in database, process from S3. Enables large files, audit trail, and reprocessing.

---

### 3. Sequential Imports, Parallel Ranking

**Decision**: Import jobs run with concurrency=1 (sequential). Ranking runs with concurrency=20 companies in parallel.

**Why**: The same company domain might appear in multiple CSV rows. Parallel imports would race on company upserts, potentially creating duplicates or conflicts. Ranking is safe to parallelize because each company is independent.

**Tradeoff**: Import throughput is limited to ~100 rows/second. Large files (10k+ rows) take minutes.

**Proper solution**: Pre-process CSV to group by company domain, then upsert companies in a single batch before parallel lead imports. Or use database advisory locks per company domain.

---

### 4. Database Deduplication Only

**Decision**: Duplicate detection uses PostgreSQL `ON CONFLICT DO NOTHING` on composite unique keys rather than application-level tracking.

**Why**: Atomic deduplication at database level. No need to query existing records before insert.

**Tradeoff**: Loses granular feedback ("47 inserted, 3 duplicates skipped"). The app only knows total attempted vs total inserted.

**Proper solution**: Query existing records first, or use `ON CONFLICT DO UPDATE` with a returning clause to track which rows were actually inserted vs updated.

---

### 5. Fixed Retry Strategy (3 Attempts)

**Decision**: All background jobs retry exactly 3 times with default exponential backoff.

**Why**: Simple, consistent behavior across all job types.

**Tradeoff**: Doesn't distinguish error types:
- Rate limit errors (should backoff longer)
- Validation errors (shouldn't retry at all)
- Transient network errors (retry immediately)

**Proper solution**: Error classification with retry policies per error type. Rate limits trigger longer backoff; validation errors fail immediately; network errors retry with jitter.

---

### 6. In-Memory Optimization State (No Checkpointing)

**Decision**: Beam search optimization keeps all candidates in memory. Only persists to database when optimization completes.

**Why**: Faster iteration without database reads/writes between generations. Optimization typically runs 3-5 iterations taking 5-10 minutes total.

**Tradeoff**: If the process crashes mid-optimization, all progress is lost. Must restart from beginning.

**Proper solution**: Checkpoint after each iteration - persist beam state to database. On restart, detect incomplete run and resume from last checkpoint.

---

### 7. Long-Lived Database Transactions

**Decision**: Entire CSV import runs within a single database transaction for atomicity.

**Why**: All-or-nothing imports. If row 500 fails, rows 1-499 are rolled back. No partial imports cluttering the database.

**Tradeoff**:
- Transaction holds connections for duration of import
- Risk of timeout on very large files (10k+ rows)
- Blocks other writes to affected tables

**Proper solution**: Batch transactions (100-500 rows each) with an "import batch" tracking table. On failure, mark batch as failed and allow retry of just that batch. Accept that imports may be partially complete.

---

### 8. No Authentication

**Decision**: Skip user authentication entirely.

**Why**: Out of scope for technical challenge. Focus on core AI ranking functionality. Better-Auth is installed but not integrated.

**Proper solution**: Activate Better-Auth, add protected routes, associate data with users.

## Available Scripts

### Development
- `bun run dev` - Start all apps in development mode (web + trigger.dev)
- `bun run dev:web` - Start web app only (faster, no trigger.dev)
- `bun run dev:trigger` - Start Trigger.dev CLI for task development

### Building
- `bun run build` - Build all applications for production
- `bun run check-types` - Type check across all packages

### Database
- `bun run db:push` - Push schema changes to database
- `bun run db:generate` - Generate migration files
- `bun run db:migrate` - Run migrations
- `bun run db:studio` - Open Drizzle Studio (database GUI)
- `bun run seed` - Seed database with evaluation set

### Package-Specific
- `bun -F @leads/api build` - Type check API package
- `bun -F @leads/db build` - Type check DB package

## Features Implemented

### MVP Requirements ✅
- ✅ **CSV Upload**: Import leads from CSV into database
- ✅ **AI Qualification**: Binary qualification with reasoning
- ✅ **AI Ranking**: Rank qualified leads per company
- ✅ **Results Table**: Display leads with qualification status, rank, reasoning
- ✅ **Deployed**: Live at [persona-ranking-system.vercel.app](https://persona-ranking-system.vercel.app/)

### Bonus Challenges Completed ✅
- ✅ **🟢 Export CSV**: Export top N leads per company
- ✅ **🟢 Sortable Table**: Click column headers to sort
- ✅ **🟡 CSV Upload UI**: Drag-and-drop CSV upload from frontend
- ✅ **🔴 Prompt Optimization**: Automatic prompt optimization using evaluation set
  - Beam search algorithm
  - Gradient generation (error analysis)
  - Variant generation (improved prompts)
  - Metrics tracking (MAE, RMSE, Spearman, Kendall)
  - Visual comparison of prompt performance

## Project Highlights

### Code Quality
- **Type Safety**: Full TypeScript with strict mode, Zod validation at boundaries
- **Consistent Patterns**: Service singletons, ORPC procedures, custom hooks
- **Error Handling**: Custom error classes with codes, structured logging
- **Performance**: React.memo for list components, polling with conditional intervals

### AI Integration
- **Model Configuration**: All AI tasks use GPT-5-mini via OpenRouter (configurable per task)
- **Prompt Engineering**: Handlebars templates with persona spec substitution
- **Validation**: Zod schemas enforce structured output from AI
- **Retry Logic**: Automatic retry for incomplete responses with deduplication

### Developer Experience
- **Monorepo**: Clean separation of concerns, shared TypeScript config
- **Type-Safe APIs**: ORPC eliminates API client maintenance
- **Hot Module Reload**: Fast feedback loop with Vite
- **Database GUI**: Drizzle Studio for visual data exploration

## License

MIT
