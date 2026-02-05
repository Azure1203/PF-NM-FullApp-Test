import { Link } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Upload, FileText, Mail, CheckSquare, Send, Package, Scissors, ClipboardList, Printer, Tag, ShieldCheck } from "lucide-react";

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950" data-testid="page-how-it-works">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/">
          <Button variant="ghost" className="mb-4 gap-2" data-testid="button-back-dashboard">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
        </Link>

        <PageHeader
          title="How It Works"
          description="Complete guide to the order management workflow"
        />

        <div className="space-y-8 mt-8">
          <section data-testid="section-overview">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4" data-testid="text-overview-title">Order Process Overview</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6" data-testid="text-overview-description">
              This system helps manage closet orders from initial CSV upload through to shipping. 
              Here's the complete workflow from start to finish.
            </p>
          </section>

          <div className="space-y-6">
            <Card data-testid="card-step-1">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-step1-title">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">Step 1</span>
                    <div>Upload Order CSV</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-slate-600 dark:text-slate-400">
                <ul className="list-disc list-inside space-y-2" data-testid="list-step1-items">
                  <li>Click "Upload New" on the dashboard</li>
                  <li>Drag and drop one or more CSV files from Allmoxy</li>
                  <li>The system automatically extracts order details: PO number, customer info, shipping address</li>
                  <li>Parts are counted and categorized (core parts, dovetails, 5-piece doors, etc.)</li>
                  <li>Multiple files can be grouped into a single project</li>
                </ul>
              </CardContent>
            </Card>

            <Card data-testid="card-step-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-step2-title">
                  <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <span className="text-purple-600 dark:text-purple-400 text-sm font-medium">Step 2</span>
                    <div>Automatic Checklist Generation</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-slate-600 dark:text-slate-400">
                <p className="mb-3" data-testid="text-step2-description">When you upload a CSV, the system automatically creates:</p>
                <ul className="list-disc list-inside space-y-2" data-testid="list-step2-items">
                  <li><strong>Hardware Packing Checklist</strong> - Lists all hardware items (screws, brackets, slides, etc.) with quantities. Items are matched against the product database.</li>
                  <li><strong>Packing Slip Checklist</strong> - Lists all parts in the order for packing verification</li>
                  <li>Buyout items (items not in stock) are flagged automatically</li>
                  <li>BO Status is calculated: "NO BO HARDWARE", "WAITING FOR BO HARDWARE", or "BO HARDWARE ARRIVED"</li>
                </ul>
              </CardContent>
            </Card>

            <Card data-testid="card-step-3">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-step3-title">
                  <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <span className="text-teal-600 dark:text-teal-400 text-sm font-medium">Step 3</span>
                    <div>Automatic Email Integration</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-slate-600 dark:text-slate-400">
                <p className="mb-3" data-testid="text-step3-description">The system automatically checks Outlook for emails in the "Perfect Fit Allmoxy Emails" folder every 30 minutes:</p>
                <ul className="list-disc list-inside space-y-2" data-testid="list-step3-items">
                  <li><strong>Netley Packing Slip PDF</strong> - Matched to orders by job number</li>
                  <li><strong>Cut To Size PDF</strong> - For CTS parts cutting instructions</li>
                  <li><strong>Elias Dovetail PDF</strong> - For dovetail drawer specifications</li>
                  <li><strong>Netley 5 Piece Shaker Door PDF</strong> - For door specifications</li>
                  <li><strong>Hardware CSV</strong> - Automatically generates hardware checklist</li>
                </ul>
                <p className="mt-3 text-sm" data-testid="text-step3-note">Click "Fetch Netley Emails" to manually trigger email sync.</p>
              </CardContent>
            </Card>

            <Card data-testid="card-step-4">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-step4-title">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                    <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <span className="text-amber-600 dark:text-amber-400 text-sm font-medium">Step 4</span>
                    <div>Review & Manage Orders</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-slate-600 dark:text-slate-400">
                <p className="mb-3" data-testid="text-step4-description">Click on any order card to view details and manage:</p>
                <ul className="list-disc list-inside space-y-2" data-testid="list-step4-items">
                  <li><strong>Order Details</strong> - View and edit customer info, shipping address, notes</li>
                  <li><strong>Pallet Management</strong> - Assign files to pallets, track packaging status</li>
                  <li><strong>PDF Downloads</strong> - Download attached PDFs for printing</li>
                  <li><strong>Allmoxy Job Number</strong> - Link orders to job numbers for email matching</li>
                  <li><strong>Packaging Link</strong> - Add link to Adobe Acrobat packaging document</li>
                </ul>
              </CardContent>
            </Card>

            <Card data-testid="card-step-5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-step5-title">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <Send className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <span className="text-green-600 dark:text-green-400 text-sm font-medium">Step 5</span>
                    <div>Sync to Asana</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-slate-600 dark:text-slate-400">
                <p className="mb-3" data-testid="text-step5-description">When the order is ready, sync it to Asana for production tracking:</p>
                <ul className="list-disc list-inside space-y-2" data-testid="list-step5-items">
                  <li>Click "Sync to Asana" button on the order details page</li>
                  <li>Creates a task in Asana with all order information</li>
                  <li>Custom fields are populated (parts counts, shipping info, etc.)</li>
                  <li>Status badges show production progress (IN PRODUCTION, SHIPPED)</li>
                  <li>Asana section determines order status: JOB CONFIRMED → PACK HARDWARE → HARDWARE PACKED → PALLET PACKED → READY TO SUBMIT → READY TO LOAD → SHIPPED</li>
                </ul>
              </CardContent>
            </Card>

            <Card data-testid="card-step-6">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-step6-title">
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                    <ClipboardList className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <span className="text-red-600 dark:text-red-400 text-sm font-medium">Step 6</span>
                    <div>Packing Workflow</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-slate-600 dark:text-slate-400">
                <p className="mb-3" data-testid="text-step6-description">Use the checklists during packing:</p>
                <ul className="list-disc list-inside space-y-2" data-testid="list-step6-items">
                  <li><strong>Hardware Checklist</strong> - Check off hardware items as they're packed. Shows product images and quantities.</li>
                  <li><strong>Packing Slip Checklist</strong> - Verify all parts are included in the shipment</li>
                  <li><strong>Buyout Arrival Toggle</strong> - Mark when buyout items have arrived</li>
                  <li>Progress bars show completion percentage</li>
                </ul>
              </CardContent>
            </Card>

            <Card data-testid="card-step-7">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-step7-title">
                  <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                    <Scissors className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <span className="text-orange-600 dark:text-orange-400 text-sm font-medium">Step 7</span>
                    <div>CTS Parts Cutting</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-slate-600 dark:text-slate-400">
                <p className="mb-3" data-testid="text-step7-description">For orders with Cut-To-Size parts:</p>
                <ul className="list-disc list-inside space-y-2" data-testid="list-step7-items">
                  <li>CTS parts are automatically extracted from the CSV (items ending in .CTS)</li>
                  <li>Click the CTS Parts button to view cutting list</li>
                  <li>Mark parts as cut when complete</li>
                  <li>Button turns green when all CTS parts are cut</li>
                  <li>Cut lengths are displayed for each part</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <section className="mt-10 pt-6 border-t dark:border-slate-700" data-testid="section-label-printing">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4" data-testid="text-labels-title">Label Printing</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6" data-testid="text-labels-description">
              The system supports printing 4 types of labels directly from the browser using QZ Tray and Zebra thermal printers.
            </p>

            <div className="space-y-6">
              <Card data-testid="card-label-types">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-label-types-title">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                      <Tag className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    Label Types
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-slate-600 dark:text-slate-400">
                  <div className="space-y-4" data-testid="list-label-types">
                    <div>
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200">Project Label (4x2")</h4>
                      <p className="text-sm mt-1">Shows the project name, Cienapps job number, and PF Order ID. Used to identify the project on boxes and pallets.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200">Hardware Label (4x2")</h4>
                      <p className="text-sm mt-1">Shows the Cienapps job number, Allmoxy number, PF Order ID, order name, and pallet number. Used to label hardware packages.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200">CTS Label (4x2")</h4>
                      <p className="text-sm mt-1">Shows all job identifiers, order name, product code, cut length, and quantity. Used to label Cut-To-Size parts.</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200">Pallet Label (4x6")</h4>
                      <p className="text-sm mt-1">A larger label showing the project name, dealer name, dealer phone number, PF Order ID, and a large pallet number. One label is printed per pallet.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-printers">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-printers-title">
                    <div className="w-10 h-10 rounded-full bg-cyan-100 dark:bg-cyan-900 flex items-center justify-center">
                      <Printer className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    Printer Setup
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-slate-600 dark:text-slate-400">
                  <p className="mb-3" data-testid="text-printers-description">The system uses Zebra thermal printers that print using ZPL (Zebra Programming Language):</p>
                  <ul className="list-disc list-inside space-y-2" data-testid="list-printers">
                    <li><strong>4x2" Printer</strong> - Used for Project, Hardware, and CTS labels. This is a standard Zebra desktop printer loaded with 4"x2" direct thermal labels.</li>
                    <li><strong>4x6" Printer</strong> - Used for Pallet labels. This is a Zebra printer loaded with 4"x6" direct thermal labels.</li>
                    <li>Both printers must be installed on the computer and the printer names must be configured in the Printer Settings dialog (gear icon on the dashboard).</li>
                    <li>Printer names must match exactly what's shown in Windows Printers &amp; Scanners.</li>
                  </ul>
                </CardContent>
              </Card>

              <Card data-testid="card-qz-tray">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-qz-tray-title">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    QZ Tray &amp; Digital Certificate
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-slate-600 dark:text-slate-400">
                  <p className="mb-3" data-testid="text-qz-description">QZ Tray is a small program that runs in the background on your computer. It acts as a bridge between the web browser and your printers, allowing the website to send print jobs directly to the Zebra printers.</p>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-2">How It Works</h4>
                  <ul className="list-disc list-inside space-y-2" data-testid="list-qz-how">
                    <li>QZ Tray runs in the system tray (near the clock) on each computer</li>
                    <li>When you click a "Print" button, the website sends the label data to QZ Tray</li>
                    <li>QZ Tray forwards the label data (ZPL commands) to the correct printer</li>
                    <li>The label prints instantly without any print dialog</li>
                  </ul>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-2">Digital Certificate (Auto-Signing)</h4>
                  <p className="mb-2">QZ Tray requires a digital certificate to trust the website. This prevents unauthorized websites from printing. Our setup uses auto-signing so you never see a trust prompt:</p>
                  <ul className="list-disc list-inside space-y-2" data-testid="list-qz-cert">
                    <li>A custom digital certificate is stored in the app</li>
                    <li>The matching private key is stored securely on the server</li>
                    <li>When QZ Tray connects, the server signs the connection request automatically</li>
                    <li>QZ Tray verifies the signature and trusts the website — no manual approval needed</li>
                  </ul>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-2">Setting Up a New Computer</h4>
                  <ol className="list-decimal list-inside space-y-2" data-testid="list-qz-setup">
                    <li>Install QZ Tray from <strong>qz.io</strong></li>
                    <li>Copy the <strong>override.crt</strong> certificate file to the QZ Tray installation folder (typically <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-sm">C:\Program Files\QZ Tray\</code>)</li>
                    <li>Install and name the Zebra printers in Windows (names must match what's configured in Printer Settings)</li>
                    <li>Restart QZ Tray — auto-signing will work immediately</li>
                  </ol>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="mt-10 pt-6 border-t dark:border-slate-700" data-testid="section-filters">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4" data-testid="text-filters-title">Dashboard Filters</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-700" data-testid="info-status-filters">
                <h3 className="font-semibold mb-2 dark:text-slate-100" data-testid="text-status-filters-title">Status Filters</h3>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1" data-testid="list-status-filters">
                  <li><strong>All</strong> - Show all orders</li>
                  <li><strong>In Production</strong> - Orders being worked on</li>
                  <li><strong>Pending</strong> - Not yet synced to Asana</li>
                  <li><strong>Synced</strong> - Synced to Asana</li>
                  <li><strong>Shipped</strong> - Completed and shipped</li>
                </ul>
              </div>
              <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-700" data-testid="info-search">
                <h3 className="font-semibold mb-2 dark:text-slate-100" data-testid="text-search-title">Search</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="text-search-description">
                  Search by project name, PO number, dealer name, or shipping address. 
                  Results filter in real-time as you type.
                </p>
              </div>
            </div>
          </section>

          <section className="mt-6 pt-6 border-t dark:border-slate-700" data-testid="section-products">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4" data-testid="text-products-title">Products Database</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4" data-testid="text-products-description">
              The Products page manages the hardware and component database used for checklist generation:
            </p>
            <ul className="list-disc list-inside text-slate-600 dark:text-slate-400 space-y-2" data-testid="list-products-items">
              <li><strong>Hardware Items</strong> - Screws, brackets, slides, etc. with stock status</li>
              <li><strong>Components</strong> - Doors, drawer boxes, etc. from suppliers</li>
              <li><strong>Bulk Import</strong> - Import products from CSV files</li>
              <li><strong>Images</strong> - Add product images for visual identification during packing</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
