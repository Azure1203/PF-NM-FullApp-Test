# Order Process Guide

Complete guide to the order management workflow.

## Order Process Overview

This system helps manage closet orders from initial CSV upload through to shipping. Here's the complete workflow from start to finish.

---

## Step 1: Upload Order CSV

1. Click "Upload New" on the dashboard
2. Drag and drop one or more CSV files from Allmoxy
3. The system automatically extracts order details: PO number, customer info, shipping address
4. Parts are counted and categorized (core parts, dovetails, 5-piece doors, etc.)
5. Multiple files can be grouped into a single project

---

## Step 2: Automatic Checklist Generation

When you upload a CSV, the system automatically creates:

- **Hardware Packing Checklist** - Lists all hardware items (screws, brackets, slides, etc.) with quantities. Items are matched against the product database.
- **Packing Slip Checklist** - Lists all parts in the order for packing verification
- Buyout items (items not in stock) are flagged automatically
- BO Status is calculated: "NO BO HARDWARE", "WAITING FOR BO HARDWARE", or "BO HARDWARE ARRIVED"

---

## Step 3: Automatic Email Integration

The system automatically checks Outlook for emails in the "Perfect Fit Allmoxy Emails" folder every 30 minutes:

- **Netley Packing Slip PDF** - Matched to orders by job number
- **Cut To Size PDF** - For CTS parts cutting instructions
- **Elias Dovetail PDF** - For dovetail drawer specifications
- **Netley 5 Piece Shaker Door PDF** - For door specifications
- **Hardware CSV** - Automatically generates hardware checklist

Click "Fetch Netley Emails" on the dashboard to manually trigger email sync.

---

## Step 4: Review & Manage Orders

Click on any order card to view details and manage:

- **Order Details** - View and edit customer info, shipping address, notes
- **Pallet Management** - Assign files to pallets, track packaging status
- **PDF Downloads** - Download attached PDFs for printing
- **Allmoxy Job Number** - Link orders to job numbers for email matching
- **Packaging Link** - Add link to Adobe Acrobat packaging document

---

## Step 5: Sync to Asana

When the order is ready, sync it to Asana for production tracking:

1. Click "Sync to Asana" button on the order details page
2. Creates a task in Asana with all order information
3. Custom fields are populated (parts counts, shipping info, etc.)
4. Status badges show production progress (IN PRODUCTION, SHIPPED)
5. Asana section determines order status:
   - JOB CONFIRMED
   - PACK HARDWARE
   - HARDWARE PACKED
   - PALLET PACKED
   - READY TO SUBMIT
   - READY TO LOAD
   - SHIPPED

---

## Step 6: Packing Workflow

Use the checklists during packing:

- **Hardware Checklist** - Check off hardware items as they're packed. Shows product images and quantities.
- **Packing Slip Checklist** - Verify all parts are included in the shipment
- **Buyout Arrival Toggle** - Mark when buyout items have arrived
- Progress bars show completion percentage

---

## Step 7: CTS Parts Cutting

For orders with Cut-To-Size parts:

1. CTS parts are automatically extracted from the CSV (items ending in .CTS)
2. Click the CTS Parts button to view cutting list
3. Mark parts as cut when complete
4. Button turns green when all CTS parts are cut
5. Cut lengths are displayed for each part

---

## Dashboard Filters

### Status Filters

- **All** - Show all orders
- **In Production** - Orders being worked on
- **Pending** - Not yet synced to Asana
- **Synced** - Synced to Asana
- **Shipped** - Completed and shipped

### Search

Search by project name, PO number, dealer name, or shipping address. Results filter in real-time as you type.

---

## Products Database

The Products page manages the hardware and component database used for checklist generation:

- **Hardware Items** - Screws, brackets, slides, etc. with stock status
- **Components** - Doors, drawer boxes, etc. from suppliers
- **Bulk Import** - Import products from CSV files
- **Images** - Add product images for visual identification during packing
