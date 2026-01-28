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

## Recent Changes

### January 2026
- Added "IN PRODUCTION" and "SHIPPED" status badges to order cards based on Asana section
  - Purple badge shows "IN PRODUCTION" for sections: JOB CONFIRMED, HARDWARE PACKED, PALLET PACKED, READY TO SUBMIT, READY TO LOAD
  - Teal badge shows "SHIPPED" when order is in SHIPPED section
  - These are display-only badges derived from Asana section data (no sync back to Asana)
- Improved mobile responsiveness of Dashboard:
  - Header buttons wrap and use compact text on small screens
  - Stats grid shows 2 columns on mobile with smaller padding
  - Filter buttons wrap with shorter labels on mobile
  - Order cards more compact on mobile with truncated text
  - PageHeader component responsive with smaller text on mobile
- Products form now uses Weight (grams) instead of Length/Width/Height dimensions

### Hardware Product Management & Packaging Checklist System
- **Products Schema Extended**: Added stockStatus (IN_STOCK/BUYOUT), supplier, and importRowNumber fields
- **Hardware CSV Import**: New /hardware-import page to bulk import products from CSV with preview
  - Shows new/unchanged/changed items before committing changes
  - Supports batch image linking by row numbers (e.g., "7,8,9" or "32-35")
- **Hardware Packing Checklist**: New table (hardware_checklist_items) to track order hardware
  - Links items to product database by code
  - Tracks quantities, buyout status, buyout arrival, and packing status
  - Auto-calculates BO status: NO BO HARDWARE / WAITING FOR BO HARDWARE / BO HARDWARE ARRIVED
- **Order Details Integration**: 
  - HardwareCsvUploadSection: Upload hardware CSV to generate packing checklist
  - HardwarePackingChecklist: Shows items with product images, quantities, packed checkboxes, buyout arrival toggles
- **API Endpoints**:
  - POST /api/files/:fileId/generate-hardware-checklist - Generate checklist from CSV
  - GET /api/files/:fileId/hardware-checklist - Get checklist items and progress
  - POST /api/hardware-checklist/:itemId/toggle-packed - Toggle packed status
  - POST /api/hardware-checklist/:itemId/toggle-buyout-arrived - Toggle buyout arrival

### Database-First Hardware Checklist Generation
- **Cross-Reference Approach**: Hardware checklist generation now cross-references ALL CSV items against the products database
- **Classification Logic**:
  - Items with category=HARDWARE in DB → added to checklist
  - Items NOT in DB but with hardware prefix (H., M-, R-, S.) → added with `notInDatabase=true` warning flag
  - Items with category=COMPONENT in DB → skipped (not hardware)
  - Items NOT in DB and no hardware prefix → skipped (not recognizable as hardware)
- **UI Warning Badges**: Hardware checklist shows "Not in DB" badge (red) for items not yet in the product database
- **Schema Update**: Added `notInDatabase` boolean field to `hardware_checklist_items` table

### Component Import System
- **New Import Page**: `/products/import-components` for importing component products (doors, drawer boxes, etc.)
- **CSV Format**: A=name, B=code, C=supplier (different from hardware CSV)
- **Category Assignment**: All imported components automatically get category=COMPONENT, stockStatus=IN_STOCK
- **Zod Validation**: Component import endpoints validate request data with Zod schemas
- **API Endpoints**:
  - POST /api/components/import/preview - Parse CSV and compare with existing products
  - POST /api/components/import - Import new component products
  - POST /api/components/import/update - Update existing products to COMPONENT category

### M&J Woodcraft and Richelieu Door Counts
- **Database-Driven Counts**: `countPartsFromCSV` is now async and cross-references products DB
- **Supplier-Based Matching**: 
  - M&J doors counted when product has category=COMPONENT AND supplier contains 'MJ Woodcraft' or 'M&J Woodcraft'
  - Richelieu doors counted when product has category=COMPONENT AND supplier contains 'Richelieu'
- **No More Keyword Matching**: Replaced hardcoded keyword arrays with database lookups

### Outlook Integration - Netley Packing Slip PDF Support
- **Auto-Detection**: Outlook scheduler now detects and matches "Netley Packing Slip" PDFs (e.g., `1892 - Netley Packing Slip.pdf`)
- **Pattern Matching**: Matches filenames containing "Netley Packing Slip" or "Netley_Packing_Slip"
- **Database Column**: `netleyPackingSlipPdfPath` stores the path to the PDF in object storage
- **API Endpoints**:
  - GET /api/files/:fileId/netley-packing-slip-pdf - Download the PDF
  - DELETE /api/files/:fileId/netley-packing-slip-pdf - Delete the PDF
- **UI**: Purple "Packing Slip" button displayed in Order Details when PDF is available

### Outlook Integration - Automatic Hardware CSV Processing
- **CSV Attachment Detection**: Outlook scheduler now detects CSV attachments (not just PDFs)
- **Hardware CSV Matching**: Files with "HARDWARE" in filename are matched to orders by order number
  - Format: `Test_Import_Order_-_1877_HARDWARE.csv` (order 1877)
  - CSV format: col0=quantity, col1=code, col5=type (HARDWARE or COMPONENT)
- **Auto-Generated Checklist**: When hardware CSV is matched:
  - CSV stored in object storage at `.private/hardware-csvs/`
  - Checklist items auto-generated with product lookups
  - Duplicate codes aggregated (quantities summed)
  - BO status calculated and stored on order file

### Packing Slip Checklist from CSV (No PDF Parsing)
- **CSV-Based Data**: Packing checklist items are generated from the order CSV file during import
- **Data Source**: All checklist data comes from CSV columns: code (0), description (1), quantity (2), height (3), width (4), length (5)
- **CTS Parts**: CTS cut length stored directly on packing slip items from CSV length column
- **No PDF Parsing**: Removed all packing slip PDF parsing code - packingSlipParser.ts deleted
- **Regenerate Button**: PackingChecklist page can regenerate items from stored CSV content

### CTS Cut Length on Packing Checklist
- **API Enhancement**: `/api/files/:fileId/checklist` now includes `ctsCutLength` for CTS parts
- **UI Display**: Packing Checklist page shows amber "Cut: X.X mm" badge for items with .CTS suffix
- **Data Source**: Cut lengths stored directly on packing slip items from CSV import

### Data Fix Scripts
- **script/fix-drawer-slide-skus.sql**: One-time script to fix drawer slide SKU codes
  - Removes extra dash: M-105-DS10-XXX → M-105-DS10XXX
  - Updates both products and hardware_checklist_items tables
  - Run manually in production database