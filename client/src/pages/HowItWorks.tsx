import { Link } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Upload, FileText, Mail, CheckSquare, Send, Package, Scissors, ClipboardList, Printer, Tag, ShieldCheck, Download, Monitor, RefreshCw, AlertTriangle, HardDrive, Database, Globe, Palette, Ruler } from "lucide-react";

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

            <Card data-testid="card-pallet-recommendation">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-pallet-rec-title">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <Ruler className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">Pallet Sizing</span>
                    <div>Recommended Pallet Size Logic</div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-slate-600 dark:text-slate-400">
                <p className="mb-3" data-testid="text-pallet-rec-description">
                  The system automatically recommends a pallet size based on the largest qualifying parts in the order. This is shown in both the Project Totals section and in each pallet's metrics grid.
                </p>

                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">What is a "Qualifying Part"?</h4>
                <p className="mb-3">
                  Only parts where <strong>both</strong> the length AND width are greater than 600mm are considered when determining pallet width. This filters out small or narrow pieces (like edge banding, trim strips, etc.) that would otherwise cause the system to incorrectly recommend a wider pallet.
                </p>

                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">How the Recommendation Works</h4>
                <p className="mb-3">The system looks at two measurements from qualifying parts:</p>
                <ul className="list-disc list-inside space-y-1 mb-4">
                  <li><strong>Max Width</strong> - The widest qualifying part across all files in the project</li>
                  <li><strong>Max Length</strong> - The longest part across all files in the project</li>
                </ul>

                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Decision Logic</h4>
                <p className="mb-2">First, the system checks if a wide (44") pallet is needed:</p>
                <ul className="list-disc list-inside space-y-1 mb-4">
                  <li>If the widest qualifying part is <strong>864mm (34") or less</strong> &rarr; use a <strong>34" wide</strong> pallet</li>
                  <li>If the widest qualifying part is <strong>over 864mm (34")</strong> &rarr; use a <strong>44" wide</strong> pallet</li>
                </ul>

                <p className="mb-2">Then, pallet length is determined based on the longest part (with a 2" buffer built into thresholds):</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border dark:border-slate-700 mb-4" data-testid="table-pallet-sizes">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800">
                        <th className="text-left p-2 border-b dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">Widest Part</th>
                        <th className="text-left p-2 border-b dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">Longest Part</th>
                        <th className="text-left p-2 border-b dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">Recommended Pallet</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700">Up to 864mm (34")</td>
                        <td className="p-2 border-b dark:border-slate-700">Any length</td>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">34" x 104"</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700">Over 864mm (34")</td>
                        <td className="p-2 border-b dark:border-slate-700">Up to 2388mm (94")</td>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">44" x 96"</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700">Over 864mm (34")</td>
                        <td className="p-2 border-b dark:border-slate-700">2389mm - 2592mm (94" - 102")</td>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">44" x 104"</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700">Over 864mm (34")</td>
                        <td className="p-2 border-b dark:border-slate-700">Over 2592mm (102")</td>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">44" x 110"</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Where It's Displayed</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Project Totals</strong> - Blue tile showing the recommended pallet and the largest part dimensions</li>
                  <li><strong>Pallet Metrics Grid</strong> - Blue tile at the end of each pallet's packing buttons, with largest part dimensions</li>
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
                <ul className="list-disc list-inside space-y-2 mb-4" data-testid="list-step5-items">
                  <li>Click "Sync to Asana" button on the order details page</li>
                  <li>Creates a task in the Asana project with the order name as the task title</li>
                  <li>All custom fields listed below are automatically populated</li>
                  <li>Status badges show production progress (IN PRODUCTION, SHIPPED)</li>
                  <li>Asana section determines order status: JOB CONFIRMED, PACK HARDWARE, HARDWARE PACKED, PALLET PACKED, READY TO SUBMIT, READY TO LOAD, SHIPPED</li>
                </ul>

                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">How It Works Behind the Scenes</h4>
                <ol className="list-decimal list-inside space-y-2 text-sm mb-4">
                  <li>The system connects to Asana using OAuth (you logged in with your Asana account when setting up the app)</li>
                  <li>It reads the list of custom fields configured on the Asana project</li>
                  <li>For each custom field, it matches the field name (case-insensitive) against the known fields listed below</li>
                  <li>If a match is found and the order has data for that field, the value is set on the new Asana task</li>
                  <li>Some fields accept multiple name variations (listed as "also accepts" below) so renaming fields in Asana won't break the sync</li>
                </ol>

                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-3">Custom Fields Synced to Asana</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border dark:border-slate-700" data-testid="table-asana-fields">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800">
                        <th className="text-left p-2 border-b dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">Asana Field Name</th>
                        <th className="text-left p-2 border-b dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">Type</th>
                        <th className="text-left p-2 border-b dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">What Gets Synced</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">PF Dealer</td>
                        <td className="p-2 border-b dark:border-slate-700">Text</td>
                        <td className="p-2 border-b dark:border-slate-700">Dealer name from the order. Also accepts: "Perfect Fit Dealer"</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">Order Date</td>
                        <td className="p-2 border-b dark:border-slate-700">Text or Date</td>
                        <td className="p-2 border-b dark:border-slate-700">The order date extracted from the CSV. Works with both text and date-type fields in Asana.</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">PF Address</td>
                        <td className="p-2 border-b dark:border-slate-700">Text</td>
                        <td className="p-2 border-b dark:border-slate-700">Full shipping address from the order</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">PF Phone Number</td>
                        <td className="p-2 border-b dark:border-slate-700">Text</td>
                        <td className="p-2 border-b dark:border-slate-700">Dealer phone number</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">PF Tax ID</td>
                        <td className="p-2 border-b dark:border-slate-700">Text</td>
                        <td className="p-2 border-b dark:border-slate-700">Tax ID from the order. Also accepts: "PF Tax ID:"</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">PF Order ID</td>
                        <td className="p-2 border-b dark:border-slate-700">Text or Number</td>
                        <td className="p-2 border-b dark:border-slate-700">The order ID. Also accepts: "Order ID". Works with both text and number-type fields.</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">PF Power Tailgate Needed</td>
                        <td className="p-2 border-b dark:border-slate-700">Dropdown (Yes/No)</td>
                        <td className="p-2 border-b dark:border-slate-700">Whether a power tailgate is needed for delivery. Also accepts: "PF Power Tailgate Needed?"</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">PF Phone Appt Needed</td>
                        <td className="p-2 border-b dark:border-slate-700">Dropdown (Yes/No)</td>
                        <td className="p-2 border-b dark:border-slate-700">Whether a phone appointment is needed before delivery. Also accepts: "PF Phone Appt Needed?"</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">PF PO</td>
                        <td className="p-2 border-b dark:border-slate-700">Text</td>
                        <td className="p-2 border-b dark:border-slate-700">File names from the order (without .csv extension). If multiple files, each name appears on its own line. Also accepts: "PF PO:"</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">PF 5106 Form Needed</td>
                        <td className="p-2 border-b dark:border-slate-700">Dropdown (Yes/No)</td>
                        <td className="p-2 border-b dark:border-slate-700">
                          <strong>Automatically determined</strong> based on the shipping address. US addresses = "Yes", Canadian addresses = "No". 
                          Canadian detection checks for: postal code pattern (A1A 1A1), province codes (AB, BC, ON, etc.), or the word "Canada" in the address. 
                          Also accepts: "PF 5106 Form Needed?", "PF 5016 Form Needed", "PF 5016 Form Needed?"
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">Packaging Cost</td>
                        <td className="p-2 border-b dark:border-slate-700">Number or Text</td>
                        <td className="p-2 border-b dark:border-slate-700">Calculated automatically: number of pallets x $150</td>
                      </tr>
                      <tr>
                        <td className="p-2 border-b dark:border-slate-700 font-medium">Cienapps Job Number</td>
                        <td className="p-2 border-b dark:border-slate-700">Text</td>
                        <td className="p-2 border-b dark:border-slate-700">The Cienapps job number if one has been entered on the order</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium">PF Production Status</td>
                        <td className="p-2">Multi-select</td>
                        <td className="p-2">
                          Production status tags derived from the order data. Includes auto-detected statuses (like CTS, 5-PIECE DOORS, DOVETAILS) and buyout status (NO BO HARDWARE, WAITING FOR BO HARDWARE, BO HARDWARE ARRIVED).
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">Reading Status Back from Asana</h4>
                <p className="text-sm">
                  The system also reads the Asana task's section (column) to determine the order's production status. 
                  When you move a task between sections in Asana (e.g., from "PACK HARDWARE" to "HARDWARE PACKED"), 
                  the dashboard reflects this with status badges: a purple "IN PRODUCTION" badge for active sections, 
                  and a teal "SHIPPED" badge when the task reaches the SHIPPED section.
                </p>
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

          <section className="mt-10 pt-6 border-t dark:border-slate-700" data-testid="section-asana-auto-import">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4" data-testid="text-auto-import-title">Asana Auto-Import</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6" data-testid="text-auto-import-description">
              Orders can be automatically imported from Asana without manually uploading CSV files. The system polls an Asana project for new tasks and imports their CSV attachments.
            </p>
            <div className="space-y-6">
              <Card data-testid="card-auto-import-workflow">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-auto-import-workflow-title">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                      <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    How Auto-Import Works
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-slate-600 dark:text-slate-400">
                  <ol className="list-decimal list-inside space-y-2 mb-4" data-testid="list-auto-import-steps">
                    <li>An external system (e.g., Allmoxy) creates a task in the <strong>NEW JOBS</strong> Asana project</li>
                    <li>The task is moved to the <strong>READY TO IMPORT</strong> section (either manually or automatically)</li>
                    <li>The app polls the READY TO IMPORT section every <strong>10 minutes</strong></li>
                    <li>For each new task, it downloads all CSV attachments from the task</li>
                    <li>The CSVs are parsed and an order is created, just like a manual upload</li>
                    <li>The Asana task ID is saved on the order for future syncing</li>
                    <li>The task is marked as processed so it won't be imported again</li>
                  </ol>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">Syncing Auto-Imported Orders</h4>
                  <p className="text-sm mb-2">When you click "Sync to Asana" on an auto-imported order, the system <strong>updates the existing task</strong> rather than creating a new one. This means:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>All custom fields are populated on the original task</li>
                    <li>The task stays linked across both the NEW JOBS and PRODUCTION projects</li>
                    <li>No duplicate tasks are created</li>
                  </ul>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">Manual Import Trigger</h4>
                  <p className="text-sm">
                    You can click the "Import from Asana" button on the Dashboard to trigger an immediate import instead of waiting for the next scheduled poll. The tooltip shows the last import time and total orders imported.
                  </p>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">Auto-Imported Badge</h4>
                  <p className="text-sm">
                    Orders that were auto-imported from Asana show an indigo "Auto-imported" badge on the Dashboard, so you can easily tell which orders came from Asana vs. manual upload.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

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
                  <p className="mb-3" data-testid="text-qz-description">QZ Tray is a small program that runs in the background on your computer. It acts as a bridge between the web browser and your Zebra printers, allowing the website to send print jobs directly without any print dialog or driver configuration.</p>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-5 mb-2">What is QZ Tray?</h4>
                  <ul className="list-disc list-inside space-y-2" data-testid="list-qz-what">
                    <li>QZ Tray is a free, lightweight application that installs on each workstation</li>
                    <li>It sits in the system tray (the small icons near the clock in the taskbar)</li>
                    <li>It creates a connection between the website and the printers installed on that computer</li>
                    <li>Without QZ Tray running, the print buttons on the website will not work</li>
                  </ul>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-5 mb-2">How Printing Works</h4>
                  <ol className="list-decimal list-inside space-y-2" data-testid="list-qz-how">
                    <li>You click a "Print" button on the website (e.g., Print Project Label, Print Hardware Label)</li>
                    <li>The website creates the label content as ZPL commands (the language Zebra printers understand)</li>
                    <li>The website sends those commands to QZ Tray running on your computer</li>
                    <li>QZ Tray forwards the commands directly to the correct Zebra printer</li>
                    <li>The label prints instantly — no print dialog, no preview, no extra clicks</li>
                  </ol>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-5 mb-2">Why a Digital Certificate is Needed</h4>
                  <p className="mb-2">QZ Tray uses a security system to make sure only trusted websites can send print jobs. Without a certificate, QZ Tray would show a popup asking you to approve every single print request. Our setup eliminates that:</p>
                  <ul className="list-disc list-inside space-y-2" data-testid="list-qz-cert">
                    <li>A <strong>digital certificate</strong> (the <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-sm break-all">override.crt</code> file) is placed in the QZ Tray folder on each computer</li>
                    <li>The matching <strong>private key</strong> is stored securely on the server — it never leaves the server</li>
                    <li>When the website connects to QZ Tray, the server signs the connection using the private key</li>
                    <li>QZ Tray checks that signature against the certificate on the computer — if they match, the website is trusted</li>
                    <li>This all happens automatically in the background — you never see a trust prompt or approval dialog</li>
                  </ul>
                  <p className="mt-2 text-sm">The certificate is valid from February 4, 2026 to February 4, 2046 (20 years). It is named "QZ Tray Demo Cert" — this name is normal and expected.</p>

                  <div className="mt-5 p-4 bg-emerald-50 dark:bg-emerald-950 rounded-lg border border-emerald-200 dark:border-emerald-800" data-testid="section-qz-download">
                    <h4 className="font-semibold text-emerald-800 dark:text-emerald-200 mb-2 flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      Download Certificate File
                    </h4>
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-3">
                      Download the <code className="bg-emerald-100 dark:bg-emerald-900 px-1 rounded text-sm break-all">override.crt</code> file below. You will need this file when setting up QZ Tray on any new workstation.
                    </p>
                    <a href="/api/qz/certificate" download="override.crt" data-testid="button-download-cert">
                      <Button variant="default" className="gap-2 w-full sm:w-auto">
                        <Download className="w-4 h-4" />
                        Download override.crt
                      </Button>
                    </a>
                  </div>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-3 flex items-center gap-2">
                    <Monitor className="w-4 h-4" />
                    Setting Up a New Workstation
                  </h4>
                  <p className="mb-3">Follow these steps to set up label printing on a new computer:</p>

                  <div className="space-y-3" data-testid="list-qz-setup">
                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-700 dark:text-slate-200">1</span>
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-200">Install QZ Tray</p>
                        <p className="text-sm mt-1">Go to <a href="https://qz.io/download" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline" data-testid="link-qz-download">qz.io/download</a> and download QZ Tray for Windows. Run the installer with default settings. After installation, QZ Tray will appear in your system tray.</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-700 dark:text-slate-200">2</span>
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-200">Download the certificate file</p>
                        <p className="text-sm mt-1">Use the download button above to get the <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-sm break-all">override.crt</code> file. Save it somewhere easy to find (like the Desktop).</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-700 dark:text-slate-200">3</span>
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-200">Copy the certificate to the QZ Tray folder</p>
                        <p className="text-sm mt-1">Copy <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-sm break-all">override.crt</code> into the QZ Tray installation folder. The default location is:</p>
                        <code className="block mt-1 text-sm bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded break-all">C:\Program Files\QZ Tray\</code>
                        <p className="text-sm mt-1">Windows may ask for administrator permission — click "Continue" to allow the copy.</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-700 dark:text-slate-200">4</span>
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-200">Restart QZ Tray</p>
                        <p className="text-sm mt-1">Right-click the QZ Tray icon in the system tray and choose <strong>Exit</strong>. Then reopen QZ Tray from the Start Menu. It needs to restart so it picks up the new certificate file.</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-700 dark:text-slate-200">5</span>
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-200">Install the Zebra printers in Windows</p>
                        <p className="text-sm mt-1">Connect your Zebra printers via USB. Go to <strong>Settings &gt; Printers &amp; Scanners</strong> and make sure each printer appears with a name. Note the exact printer names — you will need them in the next step.</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-700 dark:text-slate-200">6</span>
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-200">Configure printer names on the website</p>
                        <p className="text-sm mt-1">On the dashboard, click the gear icon to open Printer Settings. Enter the exact printer names from Windows for the 4x2" and 4x6" printers. These names are saved in your browser, so each workstation can have different printer names.</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-700 dark:text-slate-200">7</span>
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-200">Test it</p>
                        <p className="text-sm mt-1">Open any order and click one of the print buttons. The label should print automatically with no approval popup. If it works, the workstation is fully set up.</p>
                      </div>
                    </div>
                  </div>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Troubleshooting
                  </h4>
                  <div className="space-y-3" data-testid="list-qz-troubleshoot">
                    <div>
                      <p className="font-medium text-slate-700 dark:text-slate-300">Print button does nothing / "QZ Tray not found" message</p>
                      <p className="text-sm mt-1">QZ Tray is not running. Look for the QZ icon in the system tray. If it's not there, open QZ Tray from the Start Menu. It must be running whenever you want to print.</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-700 dark:text-slate-300">QZ Tray asks for approval / shows a trust popup</p>
                      <p className="text-sm mt-1">The certificate is missing or not in the right place. Make sure <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-sm break-all">override.crt</code> is in <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-sm break-all">C:\Program Files\QZ Tray\</code> and that QZ Tray was restarted after copying it.</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-700 dark:text-slate-300">Label doesn't print / wrong printer</p>
                      <p className="text-sm mt-1">Check that the printer name in the website's Printer Settings matches exactly what's in Windows Printers &amp; Scanners (including capitalization and spaces). Also confirm the printer is powered on and has labels loaded.</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-700 dark:text-slate-300">Label prints but looks wrong (garbled text, blank)</p>
                      <p className="text-sm mt-1">The printer may not be set to ZPL mode. Zebra printers can run in different "languages." Refer to your printer's manual or contact support to switch it to ZPL mode.</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-700 dark:text-slate-300">Windows shows "This certificate is not trusted" when viewing the file</p>
                      <p className="text-sm mt-1">This Windows warning is normal and can be safely ignored. You do NOT need to install the certificate into the Windows certificate store. QZ Tray reads it directly from its own folder.</p>
                    </div>
                  </div>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Important Notes
                  </h4>
                  <ul className="list-disc list-inside space-y-2 text-sm" data-testid="list-qz-notes">
                    <li>QZ Tray must be running on the computer for printing to work. If the computer restarts, QZ Tray should start automatically (it's set to run on startup by default).</li>
                    <li>Printer names are saved per browser/computer. If you use a different browser or a different computer, you will need to re-enter the printer names in Printer Settings.</li>
                    <li>The certificate file is the same for all workstations — you only need one copy.</li>
                    <li>You do NOT need to do anything on the server or website when adding new workstations. Just install QZ Tray and the certificate on the new computer.</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="mt-10 pt-6 border-t dark:border-slate-700" data-testid="section-backup">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4" data-testid="text-backup-title">Backup &amp; Disaster Recovery</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6" data-testid="text-backup-description">
              The system uses two separate backup strategies to protect your data: GitHub for the application code, and Google Sheets for the database contents.
            </p>

            <div className="space-y-6">
              <Card data-testid="card-github-backup">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-github-backup-title">
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                    </div>
                    GitHub - Code Backup
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-slate-600 dark:text-slate-400">
                  <p className="mb-3" data-testid="text-github-description">All application code is backed up to a private GitHub repository. This protects the code that runs the system (the website, server, database structure, etc.).</p>
                  <ul className="list-disc list-inside space-y-2" data-testid="list-github-items">
                    <li><strong>What it backs up</strong> - All source code files, configuration, database schema definitions, and build scripts</li>
                    <li><strong>What it does NOT back up</strong> - Database data (orders, products, checklists), uploaded PDFs, or product images</li>
                    <li><strong>How it works</strong> - Code changes are pushed to GitHub using Git. Each push creates a snapshot of the entire codebase that can be restored at any time.</li>
                    <li><strong>When to use</strong> - If the application code is lost or needs to be restored, the entire codebase can be pulled from GitHub to rebuild the system</li>
                  </ul>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-5 mb-2">How to Push Code to GitHub</h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm" data-testid="list-github-steps">
                    <li>Open the Git panel in Replit (the branch icon in the left sidebar)</li>
                    <li>Review the changed files to make sure everything looks correct</li>
                    <li>Write a short description of what changed (e.g., "Added Google Sheets backup")</li>
                    <li>Click "Commit &amp; Push" to send the code to GitHub</li>
                  </ol>
                  <p className="mt-3 text-sm">It's a good idea to push to GitHub after any significant changes to the system.</p>
                </CardContent>
              </Card>

              <Card data-testid="card-sheets-backup">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-sheets-backup-title">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                      <Database className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    Google Sheets - Data Backup
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-slate-600 dark:text-slate-400">
                  <p className="mb-3" data-testid="text-sheets-description">The "Backup" button on the Dashboard exports all your database data to a new Google Spreadsheet. This protects your actual order data, product database, and checklist records.</p>
                  <ul className="list-disc list-inside space-y-2" data-testid="list-sheets-items">
                    <li><strong>What it backs up</strong> - Orders, order files, products, pallets, hardware checklist items, and packing checklist items</li>
                    <li><strong>What it does NOT back up</strong> - Uploaded PDFs and product images (these are stored separately in object storage)</li>
                    <li><strong>How it works</strong> - Click the "Backup" button in the Dashboard header. The system creates a new Google Spreadsheet with 6 tabs (one for each data type) and exports every record with all fields.</li>
                    <li><strong>Where it goes</strong> - The spreadsheet is created in the Google account that is connected to this app. It opens automatically when the export finishes.</li>
                  </ul>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-5 mb-2">What's in the Spreadsheet</h4>
                  <div className="space-y-2 text-sm" data-testid="list-sheets-tabs">
                    <div><strong>Orders tab</strong> - Project name, PO number, dealer name, shipping address, Asana task ID, status, timestamps</div>
                    <div><strong>Order Files tab</strong> - Filenames, part counts (core parts, dovetails, 5-piece doors, etc.), weights, dimensions, glass/door flags, job numbers, notes</div>
                    <div><strong>Products tab</strong> - Product codes, names, suppliers, categories, stock status, weights</div>
                    <div><strong>Pallets tab</strong> - Pallet numbers, sizes, assigned files, notes</div>
                    <div><strong>Hardware Checklist tab</strong> - Product codes, quantities, buyout status, packed status, arrival dates</div>
                    <div><strong>Packing Checklist tab</strong> - Part codes, colors, quantities, dimensions, checked status</div>
                  </div>

                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mt-5 mb-2">Automatic Daily Backup</h4>
                  <p className="text-sm mb-2">The system automatically runs a backup every day at <strong>3:00 AM</strong>. Each backup creates a new spreadsheet inside the "Perfect Fit Orders Replit Backup" folder in Google Drive, so previous backups are never overwritten.</p>
                  <p className="text-sm">You can also run a manual backup at any time by clicking the "Backup" button on the Dashboard.</p>
                </CardContent>
              </Card>

              <Card data-testid="card-backup-summary">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3 text-lg" data-testid="text-backup-summary-title">
                    <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                      <HardDrive className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    Recovery Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-slate-600 dark:text-slate-400">
                  <p className="mb-3" data-testid="text-recovery-description">If something goes wrong, here's what you need to recover:</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border dark:border-slate-700" data-testid="table-recovery-summary">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800">
                          <th className="text-left p-2 border-b dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">What's Lost</th>
                          <th className="text-left p-2 border-b dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200">How to Recover</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="p-2 border-b dark:border-slate-700">Application code</td>
                          <td className="p-2 border-b dark:border-slate-700">Pull from GitHub</td>
                        </tr>
                        <tr>
                          <td className="p-2 border-b dark:border-slate-700">Orders &amp; checklists</td>
                          <td className="p-2 border-b dark:border-slate-700">Reference the Google Sheets backup to re-enter data</td>
                        </tr>
                        <tr>
                          <td className="p-2 border-b dark:border-slate-700">Product database</td>
                          <td className="p-2 border-b dark:border-slate-700">Re-import from the hardware/component CSV files, or reference the Google Sheets backup</td>
                        </tr>
                        <tr>
                          <td className="p-2">PDFs &amp; product images</td>
                          <td className="p-2">These would need to be re-fetched from Outlook emails or re-uploaded</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
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

          <section className="mt-6 pt-6 border-t dark:border-slate-700" data-testid="section-color-grid">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2" data-testid="text-color-grid-title">
              <Palette className="w-5 h-5" />
              Material Summary &amp; Color Grid
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4" data-testid="text-color-grid-description">
              The system tracks which material colors are used in each order file. This helps you see at a glance what sheet materials are needed for production.
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-700">
                <h3 className="font-semibold mb-2 dark:text-slate-100">How It Works</h3>
                <ol className="list-decimal list-inside text-sm text-slate-600 dark:text-slate-400 space-y-2">
                  <li>When you upload a CSV order file, the system reads each row's material code (column B in the CSV)</li>
                  <li>It compares each code against the Color Grid database, which contains all known material codes (TFL, MT, HG, HPL, etc.)</li>
                  <li>Hardware items (codes starting with M-, H., R-, S.), dovetails (DBX/SDBX), and glass items are automatically excluded</li>
                  <li>The remaining parts are grouped by color code and counted</li>
                  <li>The result is shown as a collapsible "Material Summary Report" on the order details page</li>
                </ol>
              </div>

              <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-700">
                <h3 className="font-semibold mb-2 dark:text-slate-100">Material Summary Report</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  Found on the order details page (collapsed by default, click "Material Summary Report" to expand). It shows:
                </p>
                <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400 space-y-1">
                  <li>Each file in the order listed separately with its name</li>
                  <li>The total number of material parts in each file</li>
                  <li>A breakdown of each color code used, with the full material description and part count</li>
                </ul>
              </div>

              <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-700">
                <h3 className="font-semibold mb-2 dark:text-slate-100">Color Grid Management</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  The Color Grid page (accessible from the "Colors" button on the Dashboard) manages the list of known material codes:
                </p>
                <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400 space-y-1">
                  <li>View all color codes and their full descriptions in a table</li>
                  <li>Import a new color grid from a CSV file (columns: code, description)</li>
                  <li>Importing replaces the entire grid with the new data</li>
                  <li>Currently includes TFL, MT, HG, and HPL material series</li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
