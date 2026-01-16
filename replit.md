# replit.md

## Overview

This is an order management dashboard application for handling closet orders. Users can upload CSV files containing order data, which gets parsed and stored in a PostgreSQL database. The extracted order information can be reviewed, edited, and synced to Asana for project management purposes.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, built using Vite
- **Routing**: Wouter for client-side routing (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state management and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom theme configuration and CSS variables for theming
- **Forms**: React Hook Form with Zod validation via @hookform/resolvers

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: REST API with typed route definitions in shared/routes.ts
- **File Handling**: Multer for multipart/form-data file uploads
- **CSV Parsing**: csv-parse library for processing uploaded CSV files
- **Development**: Vite dev server with HMR proxied through Express in development

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: shared/schema.ts contains table definitions
- **Migrations**: Drizzle Kit for database migrations (output to ./migrations)
- **Connection**: node-postgres (pg) Pool for database connections

### Code Organization
- **client/**: React frontend application
- **server/**: Express backend with routes, storage layer, and utilities
- **shared/**: Shared TypeScript types, schemas, and route definitions used by both frontend and backend
- **script/**: Build scripts for production bundling

### Build System
- Development: tsx for running TypeScript directly, Vite for frontend hot reloading
- Production: Custom build script using esbuild for server and Vite for client, outputs to dist/

## External Dependencies

### Asana Integration
- **Library**: asana npm package for API communication
- **Authentication**: OAuth via Replit Connectors (fetches tokens from REPLIT_CONNECTORS_HOSTNAME)
- **Purpose**: Syncing orders as tasks to Asana projects
- **Token Management**: Access tokens are refreshed dynamically, not cached

### Outlook Integration
- **Library**: Microsoft Graph API via @microsoft/microsoft-graph-client
- **Authentication**: OAuth via Replit Connectors
- **Purpose**: Automatic fetching of Netley packing slip PDFs from "Perfect Fit Allmoxy Emails" folder
- **Background Polling**: Runs every 10 minutes starting 2 minutes after server start
- **Deduplication**: Uses processedOutlookEmails table to track processed message IDs
- **Scheduler**: server/outlookScheduler.ts handles background polling and status tracking

### Database
- **PostgreSQL**: Required, connection via DATABASE_URL environment variable
- **Session Storage**: connect-pg-simple available for session persistence (if needed)

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `REPLIT_CONNECTORS_HOSTNAME`: For Asana and Outlook OAuth token retrieval
- `REPL_IDENTITY` or `WEB_REPL_RENEWAL`: For Replit authentication headers