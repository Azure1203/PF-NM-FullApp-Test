# replit.md

## Overview

This is an order management dashboard application designed for closet orders. It enables users to upload and parse CSV files containing order data, store this information in a PostgreSQL database, and then review and edit the extracted order details. A key feature is the synchronization of orders with Asana for project management, and automated integration with Outlook for fetching packing slips and hardware CSVs. The system also includes detailed inventory management for hardware and components, along with a comprehensive packing checklist system.

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
- **Schema**: Defined in `shared/schema.ts`
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

### Core Features
- **Pallet Size Recommendation**: Calculates optimal pallet size based on order dimensions.
- **Color Breakdown**: Analyzes and displays part counts by material color, cross-referencing a stored color grid.
- **Admin Roles**: Role-based access control for sensitive operations like order deletion.
- **Order Status Tracking**: Displays production and shipping statuses derived from Asana.
- **Product Management**: Comprehensive system for managing hardware and component products, including bulk import and image linking. Includes a bulk image uploader (`/admin/product-images`) that matches images to products by filename across both Allmoxy and Hardware tables.
- **Product Image Serving**: Images uploaded via the bulk uploader are stored in object storage under `product-images/` and served via `/api/product-images/:path` with proper content-type and cache headers.
- **Hardware Packing Checklist**: Generates and manages packing checklists based on uploaded hardware CSVs, cross-referencing a product database.
- **Component Import**: Dedicated system for importing component products with specific CSV formats and validation.
- **Supplier-Based Counting**: Accurately counts doors from specific suppliers (M&J Woodcraft, Richelieu) by cross-referencing the products database.
- **Packing Slip Checklist**: Generates packing checklist items directly from order CSV data, including CTS cut lengths, eliminating PDF parsing.
- **Mobile Optimization**: Full responsiveness across all application pages.
- **Google Sheets Backup**: Daily automated and manual backup of all database data to Google Sheets, stored in a designated Google Drive folder.
- **Allmoxy Migration**: Database tables mirroring Allmoxy product/attribute exports (`allmoxy_products`, `allmoxy_item_attributes`, `allmoxy_group_attributes`, `proxy_variables`), with a `PricingEngineService` (`server/services/pricingEngine.ts`) that evaluates proxy variable formulas using `mathjs`. The service strips comments from formulas, builds a scope from order item dimensions and attribute data, and evaluates pricing expressions.

## External Dependencies

- **Asana Integration**:
    - **Library**: `asana` npm package.
    - **Authentication**: OAuth via Replit Connectors.
    - **Purpose**: Syncs orders as tasks, auto-imports orders from specific Asana projects, and updates existing tasks.
    - **Projects**: "NEW JOBS" (import source), "PRODUCTION" (tracking).
    - **Scheduling**: Auto-import scheduler polls every 10 minutes.

- **Outlook Integration**:
    - **Library**: Microsoft Graph API via `@microsoft/microsoft-graph-client`.
    - **Authentication**: OAuth via Replit Connectors.
    - **Purpose**: Automatically fetches Netley packing slip PDFs and hardware CSV attachments from designated Outlook folders.
    - **Scheduling**: Background polling runs every 10 minutes.

- **Database**:
    - **PostgreSQL**: Required for data storage.
    - **Connection**: `DATABASE_URL` environment variable.

- **Google Sheets / Google Drive Integration**:
    - **Authentication**: OAuth via Replit Connectors.
    - **Purpose**: Facilitates daily automated and manual backups of the entire database to Google Sheets, stored in a dedicated Google Drive folder.

- **Environment Variables**:
    - `DATABASE_URL`: PostgreSQL connection string.
    - `REPLIT_CONNECTORS_HOSTNAME`: For Asana, Outlook, and Google OAuth token retrieval.
    - `REPL_IDENTITY` or `WEB_REPL_RENEWAL`: For Replit authentication headers.