# Persona Ranker - Lead Qualification & Ranking System

An AI-powered lead qualification and ranking system that identifies the best contacts at target companies based on an ideal customer persona. Built for the Throxy technical challenge.

## Tech Stack

- **Frontend**: TanStack Start (SSR), React 19, TanStack Router, TanStack Query, TanStack Table
- **Backend**: ORPC (type-safe RPC), Service layer architecture
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: OpenAI (GPT-5-mini for qualification/ranking, GPT-5-mini for optimization)
- **Background Jobs**: Trigger.dev (async task execution)
- **State Management**: Jotai (client state), TanStack Query (server state)
- **UI**: shadcn/ui components, TailwindCSS 4.x
- **Monorepo**: Turborepo + Bun workspaces

## Prerequisites

- **Bun** >= 1.3.3 ([install](https://bun.sh))
- **PostgreSQL** database (local or hosted)
- **OpenAI API key** with GPT-4o access
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
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/leads

# Authentication (currently unused but required by schema)
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:3001

# Server
NODE_ENV=development
CORS_ORIGIN=http://localhost:3001

# AI
OPENAI_API_KEY=sk-proj-...

# Background Jobs (Trigger.dev)
TRIGGER_SECRET_KEY=tr_dev_...
TRIGGER_API_KEY=tr_dev_...  # Same value as TRIGGER_SECRET_KEY
USE_TRIGGER_QUEUES=false  # Set to 'true' for async execution (requires Trigger.dev setup)
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
OpenAI API (GPT-4o-mini)
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

## How It Works (Simple Explanations)

### CSV Upload & Lead Processing

Here's what happens when you upload a CSV file, step by step:

1. **📁 Choose your file**
   Drag and drop your CSV or click to browse. The app accepts CSV files with lead information (name, title, company, etc.)

2. **✅ File validation**
   The system checks if your CSV has all required columns: `firstName`, `lastName`, `jobTitle`, `companyName`, `companyDomain`, etc.

3. **👀 Preview**
   You see the first few rows displayed in a table so you can verify everything looks correct before uploading.

4. **🚀 Click "Upload"**
   Once you confirm, the CSV is sent to the server and processing begins.

5. **💾 Import phase** (Progress: 0-40%)
   The server reads each row in your CSV and creates:
   - **Companies** in the database (grouped by domain)
   - **Leads** linked to their companies

6. **🤖 Qualification phase** (Progress: 40-70%)
   AI evaluates each lead one by one: *"Does this person match our ideal customer persona?"*

   - ✅ **Qualified**: Person fits the profile
     *Example: "VP of Sales at a B2B SaaS company"*

   - ❌ **Disqualified**: Person doesn't fit
     *Example: "HR Manager" when we're targeting sales leaders*

   Each lead gets a qualification decision + reasoning explaining why.

7. **📊 Ranking phase** (Progress: 70-100%)
   For each company, AI ranks only the qualified leads from best to worst fit:
   - Groups leads by company
   - Compares leads within the same company
   - Assigns rank numbers (1 = best fit, 2 = second best, etc.)
   - Provides reasoning for each ranking

8. **✨ Results ready!**
   The leads table displays:
   - ✅/❌ Qualification status
   - 🏆 Rank number (for qualified leads)
   - 💭 AI reasoning for both qualification and ranking decisions

   You can now sort, filter, and export the top N leads per company.

**Progress bar stages:**
`Uploading → Importing → Qualifying → Ranking → Complete`

---

### Automatic Prompt Optimization

Think of this like teaching an AI judge to get better at ranking leads. Here's how it works:

#### The Challenge

Our AI ranks leads using a **prompt** (written instructions we give it). But sometimes the prompt isn't perfect—it might miss important signals or weight things incorrectly. We want to **automatically improve the prompt** without manual trial-and-error.

#### The Solution: Beam Search Optimization

**🎯 Analogy:** Imagine teaching a talent show judge to score contestants better by:
- Showing them past competitions where you know the correct winners
- Having them practice scoring those competitions
- Analyzing their mistakes and giving specific feedback
- Having them try new judging strategies based on that feedback
- Repeating until they're consistently accurate

#### Step-by-Step Process

**1. Start with baseline prompt**
We begin with our current ranking instructions (the "baseline" prompt that tells AI how to evaluate leads).

**2. Evaluation set (the answer key)**
We have 50 leads with **known correct rankings** from human experts. This is our "ground truth" to measure against.

**3. Test the baseline**
Run the baseline prompt on those 50 evaluation leads and compare AI's rankings to the correct ones.
- Calculate error metrics: **MAE** (average rank error), **RMSE** (error magnitude), **Spearman correlation** (ranking agreement)

**4. Generate improvement guidance** 🧠
An AI "gradient agent" analyzes the mistakes and writes specific advice:

> *"The current prompt ranks junior employees too highly. Focus more on seniority levels—VP and C-level titles should be weighted significantly higher than Director or Manager titles."*

> *"Decision-making authority is being undervalued. Leads with 'Head of' or 'VP of' in sales/revenue roles should score higher."*

**5. Create new prompt variants** ✨
A "variant generator agent" takes this feedback and creates 5 **new prompts**, each trying a different approach:
- Variant A: Emphasizes title seniority explicitly
- Variant B: Adds decision-making authority scoring
- Variant C: Combines both improvements
- Variant D: Focuses on company fit indicators
- Variant E: Balances multiple factors with weighted criteria

**6. Test all variants**
Run each variant prompt on the 50 evaluation leads and calculate their error metrics.

**7. Keep the best performers** 🏆
Pick the **top 2 variants** with lowest error (best rankings).

**8. Repeat (next generation)**
Use those top 2 as starting points:
- Generate 5 new variants from Variant A
- Generate 5 new variants from Variant B
- Test all 10 new variants
- Keep the best 2 again

This continues for **3-5 generations**, each time:
- Keeping the best performers
- Generating new variants from them
- Testing and comparing

**9. Deploy the winner** 🎉
After all generations, the prompt with the **lowest error** becomes the new ranking prompt.

#### Why "Beam Search"?

The name comes from how it explores options:

- 🚫 **Not exhaustive**: We don't try every possible prompt variation (would take forever)
- 🚫 **Not greedy**: We don't just follow one single best path (might miss better solutions)
- ✅ **Balanced exploration**: Like a flashlight beam, we keep multiple promising candidates (the "beam") and explore from all of them simultaneously

The "beam width" is how many top candidates we keep each generation (usually 2-3).

#### Real Example Results

```
Generation 0 (Baseline):
  MAE: 2.5  |  RMSE: 3.1  |  Spearman: 0.65

Generation 1 (5 variants tested):
  Best variant: MAE: 2.1 ✅ (16% improvement)

Generation 2 (10 variants from top 2):
  Best variant: MAE: 1.8 ✅ (28% improvement)

Generation 3 (10 variants from top 2):
  Best variant: MAE: 1.6 ✅ (36% improvement)

Final result: 36% reduction in ranking error!
```

#### What This Means

- **Before optimization**: AI would mis-rank a lead by an average of 2.5 positions
- **After optimization**: AI mis-ranks by only 1.6 positions on average
- **Impact**: More accurate lead prioritization → your sales team contacts the right people first

#### Visual in the App

The Prompts page shows:
- 📊 Performance comparison charts (MAE, RMSE, correlation)
- 📝 All prompt variants with their scores
- ⭐ Current best prompt highlighted
- 🔄 "Start Optimization" button to run beam search
- 📈 Generation-by-generation improvement tracking

---

## Key Design Decisions

### 1. Two-Phase Approach: Qualification → Ranking

**Rationale**: Separate concerns for better accuracy and cost efficiency.

- **Phase 1 - Qualification**: Binary decision (qualified/disqualified) with reasoning
  - Filters out irrelevant leads (HR for sales platform)
  - Uses cheaper GPT-4o-mini model
  - Validates against persona spec

- **Phase 2 - Ranking**: Ranks only qualified leads within each company
  - Groups by company for fair comparison
  - AI assigns ranks + reasoning for each lead
  - Top N leads per company can be exported

**Alternative considered**: Single-pass ranking of all leads. Rejected because:
- Easier to optimize qualification separately from ranking and vice versa
- Prevents context overload
- Harder to debug when rankings seem off

### 2. Service Layer Pattern (Singletons)

**Rationale**: Clear separation of concerns with testable, reusable business logic.

```typescript
class RankingService {
  private static instance: RankingService;
  private constructor() {}
  static getInstance() { /* ... */ }

  async rankQualifiedLeads() { /* business logic */ }
}

export const rankingService = RankingService.getInstance();
```

**Benefits**:
- Single source of truth for each domain (ranking, qualification, import)
- Easy to inject and mock for testing
- Prevents accidental multiple instantiations
- Aggregated into `services` object for clean imports

### 3. AI Agent Architecture

**Rationale**: Encapsulate AI-specific concerns (prompt templating, retry logic, validation).

Each agent handles:
- **Handlebars template substitution** for dynamic prompts
- **Zod schema validation** of AI responses
- **Retry logic** for incomplete/invalid responses
- **Deduplication** across retries
- **Fallback handling** when AI fails

**Example**: `rankingAgent.rankQualifiedLeads()` automatically:
1. Substitutes persona spec into prompt template
2. Calls OpenAI with Zod schema enforcement
3. Validates each lead was ranked
4. Retries for missing leads
5. Returns validated results

### 4. ORPC for Type-Safe APIs

**Rationale**: End-to-end type safety from database to frontend without code generation.

```typescript
// Backend: Define once
export const leadsRouter = {
  list: publicProcedure
    .input(leadsListInputSchema)
    .output(leadWithRankingSchema.array())
    .handler(async ({ input }) => { /* ... */ })
};

// Frontend: Auto-typed, auto-completed
const { data: leads } = useQuery(orpc.leads.list.queryOptions());
```

**Benefits**:
- No manual API clients to maintain
- TypeScript errors if backend changes
- OpenAPI documentation auto-generated
- Integrates seamlessly with TanStack Query

### 5. Prompt Optimization with Beam Search

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

### 6. Background Job Abstraction

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

## Technical Tradeoffs

### 1. Duplicate .env Files

**Decision**: Keep 3 identical .env files instead of single root file.

**Why**:
- ESM modules lack `__dirname` (can't resolve relative paths reliably)
- Different processes run from different working directories
- `import "dotenv/config"` loads from CWD (varies by context)
- Simple symlinks fail on Windows without admin privileges

**Tradeoff**: Slight duplication vs guaranteed reliability across all contexts (Vite SSR, Trigger.dev tasks, Drizzle migrations).

### 2. Large Service Files

**Decision**: Accept files >400 lines for cohesive business logic.

**Why**:
- Ranking logic is complex (qualification + ranking + batching + error handling)
- Splitting would scatter related logic across multiple files
- Cohesion matters more than arbitrary line limits
- Each service owns a single domain concern

**Future**: Could extract sub-services if services grow beyond ~800 lines.

### 3. Single Migration File

**Decision**: One monolithic migration instead of incremental files.

**Why**:
- New project (no production database to migrate)
- Changes are frequent during development
- `drizzle-kit push` is faster for prototyping
- Can generate proper migrations before production deploy

**Future**: Generate incremental migrations before first production deploy.

### 4. No Authentication

**Decision**: Skip user authentication entirely.

**Why**:
- Out of scope for technical challenge
- Focus on core AI ranking functionality
- Better-Auth is installed but not integrated
- Schema includes user tables (preparation for future)

**Future**: Activate Better-Auth, add protected routes, associate data with users.

### 5. Hardcoded Configuration

**Decision**: Constants in `config/constants.ts` instead of admin UI.

**Why**:
- Faster to iterate (no UI to build)
- Type-safe config values
- Version controlled (visible in Git history)
- Suitable for technical/admin users

**Tradeoff**: Requires code changes to adjust concurrency, batch sizes, retry limits. Could add admin panel later for non-technical users.

### 6. Limited Error Handling in UI

**Decision**: Toast notifications for errors, no retry UI.

**Why**:
- Sufficient for MVP/demo (clear feedback to user)
- TanStack Query handles retries automatically
- Complex error recovery UI is time-intensive

**Future**: Add manual retry buttons, error state components, detailed error messages.

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
- ✅ **Deployed**: Live on Vercel (URL provided separately)

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
- **Cost Awareness**: Use cheaper models (gpt-4o-mini) for qualification/ranking, gpt-4o only for optimization
- **Prompt Engineering**: Handlebars templates with persona spec substitution
- **Validation**: Zod schemas enforce structured output from AI
- **Retry Logic**: Automatic retry for incomplete responses with deduplication

### Developer Experience
- **Monorepo**: Clean separation of concerns, shared TypeScript config
- **Type-Safe APIs**: ORPC eliminates API client maintenance
- **Hot Module Reload**: Fast feedback loop with Vite
- **Database GUI**: Drizzle Studio for visual data exploration

## Future Enhancements

If more time were available:

1. **Authentication**: Activate Better-Auth, protect routes, per-user data
2. **Webhook Integration**: Real-time notifications from Trigger.dev
3. **Prompt Library**: Save/load/share optimized prompts
4. **Batch Operations**: Bulk qualification/ranking of multiple uploads
5. **Cost Tracking**: Dashboard showing AI cost per call, total spend
7. **Admin Panel**: UI for config values (concurrency, batch sizes)
8. **Testing**: Unit tests for services, integration tests for workflows
10. **Error Recovery**: Manual retry buttons, detailed error state UI

## License

MIT
