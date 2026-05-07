# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

This is the **Perfect Fit Closets / Netley Millwork Order Management System** — an Allmoxy replacement built on Replit. It processes CSV orders exported from Allmoxy and produces priced invoices, Cabinet Vision `.ORD` files, packing slips, supplier exports, and cut-to-size part lists.

The authoritative spec is at `docs/MASTER_ARCHITECTURE_SPEC_v4.md`. The live build state is at `BUILD_STATUS.md`.

## Mandatory: Update BUILD_STATUS.md on Every Change

**Every task is incomplete until `BUILD_STATUS.md` is updated.** See `AGENTS.md` for the exact required format. This applies to all changes — bug fixes, config edits, refactors, new features.

Required updates per change:
1. Prepend a new changelog entry to Section 10 (reverse-chronological, next `rN` revision number)
2. Update Section 8 Feature Status table if any feature changed state
3. Update Section 9 Known Issues if any bug was fixed or introduced
4. Bump the `**Last Updated:**` timestamp at the top

## Commands

```bash
# Development (runs Express backend with tsx + Vite frontend via middleware)
npm run dev

# Type checking
npm run check

# Production build (esbuild for server, Vite for client → dist/)
npm run build

# Start production server
npm run start

# Push DB schema changes (Drizzle Kit)
npm run db:push
```

There is no test suite. Verify changes by running the dev server and exercising the feature.

## Architecture

### Stack
- **Frontend**: React + TypeScript, Vite, Wouter routing, TanStack Query, shadcn/ui (Radix UI), Tailwind CSS
- **Backend**: Express.js + TypeScript, REST API, Multer for uploads, csv-parse for CSV
- **Database**: PostgreSQL via Drizzle ORM; schema in `shared/schema.ts`
- **Pricing engine**: mathjs — formula evaluation with dynamic grid lookups

### Directory Layout
- `client/src/` — React frontend
  - `pages/` — route-level components (Dashboard, UploadOrder, OrderDetails, etc.)
  - `pages/admin/` — admin-only pages (product manager, pricing diagnostic, grid manager, formula tester, etc.)
  - `pages/order-detail/` — components for the order detail view (FileItemsTable, FileSidebar, etc.)
  - `components/` — shared UI components
- `server/` — Express backend
  - `index.ts` — server entry, middleware setup
  - `routes.ts` — all API route handlers (large file; all endpoints defined here)
  - `storage.ts` — database query layer (typed wrapper around Drizzle)
  - `db.ts` — Drizzle + node-postgres connection pool
  - `csvHelpers.ts` — CSV parsing, part counting, hardware checklist, packing slip logic
  - `services/pricingEngine.ts` — mathjs-based formula evaluator; `evaluatePrice()` and `gridRowToScope()`
  - `services/pdfGenerator.ts` — PDF generation (invoice, packing slip, Elias, MJ, CTS)
  - `services/ordExporter.ts` — Cabinet Vision `.ORD` file generation
  - `agentmail*.ts` — AgentMail email integration and scheduler
  - `asana*.ts` / `asanaImportScheduler.ts` — Asana sync and auto-import scheduler
  - `backupScheduler.ts` / `googleSheets.ts` — Google Drive backup scheduler
  - `replit_integrations/` — Replit Auth (OIDC) and Object Storage wrappers
- `shared/` — shared between client and server
  - `schema.ts` — Drizzle table definitions + Zod insert schemas (23 tables; source of truth for all types)
  - `routes.ts` — typed API route path constants
  - `models/` — auth model types
- `migrations/` — Drizzle Kit migration SQL files
- `script/build.ts` — custom production build script (esbuild + Vite)
- `scripts/` — one-off utility scripts and SQL fixups
- `docs/` — architecture spec and build state

### Path Aliases (Vite + TypeScript)
- `@/` → `client/src/`
- `@shared/` → `shared/`
- `@assets/` → `attached_assets/`

## Core Data Model

The schema in `shared/schema.ts` is the source of truth. Key tables:

- **`projects`** — top-level order (one per PO); holds Asana sync fields, status, notes
- **`orderFiles`** — one CSV file per project; contains parsed stats (part counts, weights, door types) and paths to generated PDFs/CSVs in object storage
- **`ctsParts`** / **`ctsPartConfigs`** — cut-to-size parts extracted from CSV; configs hold images and notes
- **`pallets`** / **`palletFileAssignments`** — pallet groupings for shipping
- **`packingSlipItems`** / **`hardwareChecklistItems`** — checklist state per order file
- **`allmoxy_products`** — product catalog; matched to CSV lines via `skuPrefix`
- **`attributeGrids`** / **`attributeGridRows`** / **`productGridBindings`** — the dynamic pricing grid system
- **`proxyVariables`** — named formula variables (pricing and export formulas)
- **`allowedUsers`** — whitelist for Replit Auth access control
- **`processedAsanaTasks`** / **`processedOutlookEmails`** — dedup tables for auto-import schedulers

## Key Patterns

### Pricing Engine
`server/services/pricingEngine.ts` uses mathjs to evaluate formula strings. Grids are resolved to a scope via `gridRowToScope()`, which lowercases column names and prefixes digit-starting names with `_` (e.g., `90_degree` → `_90_degree`). Proxy variables are evaluated in order before the main formula.

### SKU Matching
CSV line items are matched to `allmoxy_products` by longest-prefix match on `skuPrefix`. See `matchProductToSku()` in `server/routes.ts`.

### CSV Upload Flow
Upload → `csvHelpers.ts:parseCSV()` → part counts via `countPartsFromCSV()` → CTS parts via `extractCTSParts()` → stored in `orderFiles` + `ctsParts` tables → pricing runs against matched products.

### External Integrations
- **Asana**: Polls "READY TO IMPORT" section every 10 min (`asanaImportScheduler.ts`); syncs task notes and status fields (`asanaNotes.ts`)
- **AgentMail**: Polls inbound email every 30 min (`agentmailScheduler.ts`); matches PDF attachments to order files by Allmoxy Job #
- **Google Drive**: Daily 3 AM auto-backup + manual trigger (`backupScheduler.ts`)
- **Replit Object Storage**: Stores packing slip PDFs, cut-to-file PDFs, hardware CSVs

### Environment Variables
- `DATABASE_URL` — required; PostgreSQL connection string
- `AGENTMAIL_API_KEY` — AgentMail scheduler only starts if set
- `REPLIT_CONNECTORS_HOSTNAME` — Asana and Google OAuth token retrieval
- `REPL_IDENTITY` or `WEB_REPL_RENEWAL` — Replit auth headers

## Admin UI

Admin pages (under `/admin/*` routes) are the only way to configure the system:
- **Product Manager** (`AllmoxyProductManager`) — CRUD for products and SKU prefixes
- **Dynamic Grid Manager** (`DynamicGridManager`) — create/edit attribute grids and rows
- **Proxy Variable Manager** (`ProxyVariableManager`) — create/edit named formula variables
- **Formula Tester** (`FormulaTester`) — test pricing formulas against real order data
- **Pricing Diagnostic** (`PricingDiagnostic`) — inspect why a line item priced a certain way
- **Admin Settings** (`AdminSettings`) — allowed users, ORD/output settings
