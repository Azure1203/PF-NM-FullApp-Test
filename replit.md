# replit.md

## Living Build Status

The single source of truth for the current state of this application — all pages, all DB tables, the pricing engine, exports, integrations, known issues, and the full changelog — lives at:
**`BUILD_STATUS.md`** (project root)

This file is updated automatically with every meaningful change to the codebase.

## Master Architecture Reference

The authoritative specification for this system lives at:
**`docs/MASTER_ARCHITECTURE_SPEC_v4.md`**

It defines every data model, formula pattern, output document, admin UI, and build prompt for the Perfect Fit Closets / Netley Millwork order management system. Read it first when planning any new feature.

**Current release:** r25 (2026-05-02) — TFL Shaker door pricing fix (digit-starting column name sanitizer); Outlook integration fully removed (replaced by AgentMail); BUILD_STATUS.md created.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript, using Vite
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS
- **Forms**: React Hook Form with Zod validation

### Backend
- **Framework**: Express.js with TypeScript
- **API Design**: REST API with typed routes
- **File Handling**: Multer for uploads, csv-parse for CSV processing

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema**: Defined in `shared/schema.ts` (23 tables)
- **Migrations**: Drizzle Kit
- **Connection**: `node-postgres` Pool

### Code Organization
- `client/`: React frontend
- `server/`: Express backend
- `shared/`: Shared types, schemas, and route definitions
- `script/`: Build and utility scripts

### Build System
- **Development**: `tsx` for backend, Vite for frontend
- **Production**: Custom build script using esbuild for server, Vite for client

## External Integrations

- **Asana**: OAuth via Replit Connectors. Syncs orders as tasks; auto-imports from "READY TO IMPORT" section every 10 min; reads PF ORDER STATUS and PRODUCTION STATUS fields.
- **AgentMail**: API key via `AGENTMAIL_API_KEY`. Polls inbound email every 30 min; matches PDF attachments to order files by Allmoxy Job #; dedup via `processed_outlook_emails` DB table (legacy name retained).
- **Google Sheets / Drive**: OAuth via Replit Connectors. Daily 3 AM auto-backup + manual trigger from Dashboard.
- **Replit Object Storage**: Used for CTS part config images and packing slip PDFs.
- **Replit Auth (OIDC)**: Session-based auth; allowed-users whitelist in DB; admin role flag.

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `AGENTMAIL_API_KEY` — AgentMail API key (AgentMail scheduler only starts if this is set)
- `REPLIT_CONNECTORS_HOSTNAME` — For Asana and Google OAuth token retrieval
- `REPL_IDENTITY` or `WEB_REPL_RENEWAL` — For Replit authentication headers
