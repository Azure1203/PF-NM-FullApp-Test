# Label Designs Reference

This file documents the finalized ZPL label templates for all 4 label types used in the order management system. Use this as the definitive reference to restore labels if any changes break them.

**Source file**: `client/src/lib/qzTray.ts`

---

## 1. Project Label (4x2 inch)

**Printer**: 4x2 label printer
**Label dimensions**: 812 x 406 dots (4" x 2" at 203 DPI)

### Visual Layout
```
┌─────────────────────────────────────────────┐
│                                             │
│              PROJECT LABEL                  │
│  ─────────────────────────────────────────  │
│  Cienapps Job #: [value]                    │
│  Project Name: [wraps up to 3 lines]        │
│  PF Order ID: [value]                       │
│                                             │
└─────────────────────────────────────────────┘
```

### Specifications
- **Label width**: 812 dots
- **Label height**: 406 dots
- **Left margin**: 30 dots
- **Starting Y position**: 31 (moved down ~2mm to prevent top clipping)
- **Font size**: 60pt for all fields
- **Line height**: 60 dots
- **Max characters per line (wrapping)**: 25

**Note**: Y positions after Project Name are dynamic — they shift down based on how many lines the name wraps to.

### Field Details
| Field | Font Size | Alignment | Y Offset from prev | Notes |
|-------|-----------|-----------|---------------------|-------|
| PROJECT LABEL | 60pt | Centered (^FB full width) | yPos=31 | Title |
| Separator line | 3px thick | Left margin to right margin | +55 | Width = labelWidth - leftMargin*2 = 752 |
| Cienapps Job # | 60pt | Left-aligned | +20 | |
| Project Name | 60pt | Left-aligned | +60 | Wraps at 25 chars, max 3 lines |
| PF Order ID | 60pt | Left-aligned | +60 | |

### ZPL Template (Y positions are approximate — actual values computed dynamically)
```zpl
~JA^XA^MTD^MNW^PW812^LL406^LS0^CI28
^FO0,31^A0N,60,60^FB812,1,0,C^FDPROJECT LABEL^FS
^FO30,86^GB752,3,3^FS
^FO30,106^A0N,60,60^FDCienapps Job #: {cienappsJobNumber}^FS
^FO30,{yPos}^A0N,60,60^FDProject Name: {projectName}^FS
  [additional wrapped lines at +60 each, max 3 lines]
^FO30,{yPos}^A0N,60,60^FDPF Order ID: {orderId}^FS
^XZ
```

### Function
```typescript
createProjectLabelZpl(data: {
  projectName: string;
  orderId: string;
  cienappsJobNumber: string;
}, labelSize: LabelSize): string
```

---

## 2. Hardware Label (4x2 inch)

**Printer**: 4x2 label printer
**Label dimensions**: 812 x 406 dots (4" x 2" at 203 DPI)

### Visual Layout
```
┌─────────────────────────────────────────────┐
│                                             │
│              HARDWARE LABEL                 │
│  ─────────────────────────────────────────  │
│  Cienapps Job #: [value]                    │
│  ALLMOXY #: [value]                          │
│  PF ORDER ID: [value]                       │
│  ORDER NAME: [wraps up to 3 lines]          │
│             PALLET X OF Y                   │
└─────────────────────────────────────────────┘
```

### Specifications
- **Label width**: 812 dots
- **Label height**: 406 dots
- **Left margin**: 30 dots
- **Starting Y position**: 24
- **Large font size**: 50pt (title, job numbers)
- **Smaller font size**: 45pt (order name)
- **Large line height**: 50 dots
- **Smaller line height**: 45 dots
- **Order name wrapping**: 35 chars max per line

**Note**: All Y positions after the title are dynamic — they shift down based on how many lines the order name wraps to.

### Field Details
| Field | Font Size | Alignment | Y Offset from prev | Notes |
|-------|-----------|-----------|---------------------|-------|
| HARDWARE LABEL | 50pt | Centered (^FB full width) | yPos=24 | Title |
| Separator line | 3px thick | Left margin to right margin | +48 | Width = labelWidth - leftMargin*2 = 752 |
| Cienapps Job # | 50pt | Left-aligned | +12 | |
| ALLMOXY # | 50pt | Left-aligned | +50 | |
| PF ORDER ID | 50pt | Left-aligned | +50 | |
| ORDER NAME | 45pt | Left-aligned | +50 | Wraps at 35 chars, max 3 lines, +45 per wrapped line |
| PALLET X OF Y | 50pt | Centered (^FB full width) | after order name | Optional: "PALLET X OF Y" if both provided, "PALLET X" if only palletNumber |

### ZPL Template (Y positions are approximate — actual values computed dynamically)
```zpl
~JA^XA^MTD^MNW^PW812^LL406^LS0^CI28
^FO0,24^A0N,50,50^FB812,1,0,C^FDHARDWARE LABEL^FS
^FO30,72^GB752,3,3^FS
^FO30,84^A0N,50,50^FDCienapps Job #: {cienappsJobNumber}^FS
^FO30,{yPos}^A0N,50,50^FDALLMOXY #: {allmoxyJobNumber}^FS
^FO30,{yPos}^A0N,50,50^FDPF ORDER ID: {orderId}^FS
^FO30,{yPos}^A0N,45,45^FDORDER NAME: {orderName}^FS
  [additional wrapped lines at +45 each, max 3 lines]
^FO0,{yPos}^A0N,50,50^FB812,1,0,C^FDPALLET {X} OF {Y}^FS
  (or ^FDPALLET {X}^FS if no palletCount)
^XZ
```

### Function
```typescript
printHardwareLabel(
  orderName: string,
  allmoxyJobNumber: string,
  orderId: string,
  cienappsJobNumber: string,
  palletNumber?: number,
  palletCount?: number
): Promise<PrintResult>
```

---

## 3. CTS Label (4x2 inch)

**Printer**: 4x2 label printer
**Label dimensions**: 812 x 406 dots (4" x 2" at 203 DPI)

### Visual Layout
```
┌─────────────────────────────────────────────┐
│                                             │
│               CTS LABEL                     │
│  ─────────────────────────────────────────  │
│  Cienapps Job #: [value]                    │
│  Perfect Fit Order ID: [value]              │
│  Allmoxy Job #: [value]                      │
│  Order Name: [wraps up to 3 lines]          │
│  [productCode] + (LENGTH: X MM) + (QTY: X)  │
│             PALLET X OF Y                   │
└─────────────────────────────────────────────┘
```

### Specifications
- **Label width**: 812 dots
- **Label height**: 406 dots
- **Left margin**: 40 dots
- **Starting Y position**: 20
- **Large font size**: 38pt (title, job numbers, order ID, allmoxy #)
- **Small font size**: 35pt (order name, product line, pallet)
- **Large line height**: 42 dots
- **Small line height**: 38 dots
- **Max characters per line (wrapping)**: 38

**Note**: Y positions after Order Name are dynamic — they shift down based on how many lines the name and product line wrap to.

### Field Details
| Field | Font Size | Alignment | Y Offset from prev | Notes |
|-------|-----------|-----------|---------------------|-------|
| CTS LABEL | 38pt | Centered (^FB full width) | yPos=20 | Title |
| Separator line | 2px thick | Left margin to right margin | +45 | Width = labelWidth - leftMargin*2 = 732 |
| Cienapps Job # | 38pt | Left-aligned | +15 | |
| Perfect Fit Order ID | 38pt | Left-aligned | +42 | |
| Allmoxy Job # | 38pt | Left-aligned | +42 | |
| Order Name | 35pt | Left-aligned | +42 | Wraps at 38 chars, max 3 lines, +38 per line |
| Product line | 35pt | Left-aligned | +38 | Format: "{code} + (LENGTH: {mm} MM) + (QTY: {qty})", wraps at 38 chars, max 2 lines |
| PALLET X OF Y | 35pt | Centered (^FB full width) | after product | Optional, only if palletNumber provided |

### ZPL Template (Y positions are approximate — actual values computed dynamically)
```zpl
~JA^XA^MTD^MNW^PW812^LL406^LS0^CI28
^FO0,20^A0N,38,38^FB812,1,0,C^FDCTS LABEL^FS
^FO40,65^GB732,2,2^FS
^FO40,80^A0N,38,38^FDCienapps Job #: {cienappsJobNumber}^FS
^FO40,{yPos}^A0N,38,38^FDPerfect Fit Order ID: {orderId}^FS
^FO40,{yPos}^A0N,38,38^FDAllmoxy Job #: {allmoxyJobNumber}^FS
^FO40,{yPos}^A0N,35,35^FDOrder Name: {orderName}^FS
  [additional wrapped lines at +38 each, max 3 lines]
^FO40,{yPos}^A0N,35,35^FD{productCode} + (LENGTH: {cutLength} MM) + (QTY: {quantity})^FS
  [additional wrapped lines at +38 each, max 2 lines]
^FO0,{yPos}^A0N,35,35^FB812,1,0,C^FDPALLET {X} OF {Y}^FS
  (or ^FDPALLET {X}^FS if no palletCount)
^XZ
```

### Function
```typescript
printCTSLabel(
  orderName: string,
  allmoxyJobNumber: string,
  orderId: string,
  cienappsJobNumber: string,
  productName: string,   // passed but not used in ZPL output
  productCode: string,   // used in the product line on the label
  quantity: number,
  cutLength: number,
  palletNumber?: number,
  palletCount?: number
): Promise<PrintResult>
```

---

## 4. Pallet Label (4x6 inch)

**Printer**: 4x6 label printer
**Label dimensions**: 812 x 1218 dots (4" x 6" at 203 DPI)

### Visual Layout
```
┌─────────────────────────────────────────────┐
│                                             │
│  PALLET LABEL                               │
│  ─────────────────────────────────────────  │
│                                             │
│  Project:                                   │
│  ──────────                                 │
│  [project name, wraps up to 3 lines]        │
│                                             │
│  ═══════════════════════════════════════════ │
│                                             │
│  Dealer:                                    │
│  ────────                                   │
│  [dealer name, wraps]                       │
│                                             │
│  ═══════════════════════════════════════════ │
│                                             │
│  Dealer Phone #:                            │
│  ──────────────                             │
│  [phone number]                             │
│                                             │
│  ═══════════════════════════════════════════ │
│                                             │
│  PF ORDER ID:                               │
│  ────────────                               │
│  [order ID]                                 │
│                                             │
│                                             │
│                PALLET                        │
│              ──────────                      │
│              X OF Y                          │
│                                             │
└─────────────────────────────────────────────┘
```

### Specifications
- **Label width**: 812 dots
- **Label height**: 1218 dots
- **Left margin**: 40 dots
- **Starting Y position**: 78
- **Font size**: 56pt (^CF0,56) for all section headers and values
- **Large font size**: 113pt (^CF0,113) for PALLET number at bottom
- **Line spacing**: 55 dots between section header and underline
- **Max characters per line (wrapping)**: 24 (PALLET_MAX_CHARS)

**Note**: All Y positions after the title are dynamic — they shift down based on how many lines the project name and dealer name wrap to. The PALLET number section at the bottom is at fixed positions (y=950, 1060, 1095).

### Field Details
| Field | Font Size | Alignment | Notes |
|-------|-----------|-----------|-------|
| PALLET LABEL | 56pt | Left-aligned | Title at yPos=78 |
| Title separator | 2px, 450 dots wide | Left-aligned | Under title |
| "Project:" header | 56pt | Left-aligned | Section label |
| Project underline | 2px, 240 dots wide | Left-aligned | Under "Project:" |
| Project name | 56pt | Left-aligned | Wraps at 24 chars, max 3 lines, +60 per line. Extra +10 spacing if only 1 line |
| Section divider | 6px, 732 dots wide | Left-aligned | Heavy line between sections |
| "Dealer:" header | 56pt | Left-aligned | Section label |
| Dealer underline | 2px, 210 dots wide | Left-aligned | Under "Dealer:" |
| Dealer name | 56pt | Left-aligned | Wraps at 24 chars, +60 per line. Extra +10 spacing if only 1 line |
| Section divider | 6px, 732 dots wide | Left-aligned | Heavy line |
| "Dealer Phone #:" header | 56pt | Left-aligned | Section label |
| Phone underline | 2px, 380 dots wide | Left-aligned | Under "Dealer Phone #:" |
| Phone number | 56pt | Left-aligned | Single line |
| Section divider | 6px, 732 dots wide | Left-aligned | Heavy line |
| "PF ORDER ID:" header | 56pt | Left-aligned | Section label |
| Order ID underline | 2px, 320 dots wide | Left-aligned | Under "PF ORDER ID:" |
| Order ID value | 56pt | Left-aligned | Single line |
| "PALLET" | 113pt | Centered (^FB full width) | Fixed at y=950 |
| Pallet underline | 2px, 320 dots wide | Centered at x=246 | Fixed at y=1060 |
| "X OF Y" | 113pt | Centered (^FB full width) | Fixed at y=1095 |

### ZPL Template
```zpl
~JA^XA^MTD^MNW^PW812^LL1218^LS0^CI28
^CF0,56
^FO40,78^FDPALLET LABEL^FS
^FO40,133^GB450,2,2^FS

^CF0,56
^FO40,163^FDProject:^FS
^FO40,218^GB240,2,2^FS
^FO40,233^FD{projectName line 1}^FS
  [additional wrapped lines at +60 each, max 3]

^FO40,{yPos}^GB732,6,6^FS

^CF0,56
^FO40,{yPos}^FDDealer:^FS
^FO40,{yPos}^GB210,2,2^FS
^FO40,{yPos}^FD{dealer}^FS

^FO40,{yPos}^GB732,6,6^FS

^CF0,56
^FO40,{yPos}^FDDealer Phone #:^FS
^FO40,{yPos}^GB380,2,2^FS
^FO40,{yPos}^FD{phone}^FS

^FO40,{yPos}^GB732,6,6^FS

^CF0,56
^FO40,{yPos}^FDPF ORDER ID:^FS
^FO40,{yPos}^GB320,2,2^FS
^FO40,{yPos}^FD{orderId}^FS

^CF0,113
^FO0,950^FB812,1,0,C^FDPALLET^FS
^FO246,1060^GB320,2,2^FS
^FO0,1095^FB812,1,0,C^FD{pallet} OF {palletCount}^FS
^XZ
```

### Function
```typescript
printPalletLabels(
  date: string,
  projectName: string,
  orderId: string,
  palletCount: number,
  dealer?: string,
  phone?: string
): Promise<PalletPrintResult>
```

Note: This function prints one label per pallet (loops from 1 to palletCount).

---

## Common ZPL Commands Reference

| Command | Purpose |
|---------|---------|
| `^XA` / `^XZ` | Start / end label format |
| `~JA` | Cancel all pending jobs |
| `^MTD` | Media type: direct thermal |
| `^MNW` | Media tracking: web sensing |
| `^PW812` | Print width in dots |
| `^LL406` | Label length in dots |
| `^LS0` | Label shift (0) |
| `^CI28` | Character encoding (UTF-8) |
| `^FO{x},{y}` | Field origin position |
| `^A0N,{h},{w}` | Scalable font, normal orientation |
| `^CF0,{size}` | Change default font and size |
| `^FD{data}^FS` | Field data and field separator |
| `^FB{width},{lines},{lineSpacing},{alignment}` | Field block (C=center, L=left, R=right) |
| `^GB{width},{height},{thickness}` | Graphic box (line) |

## Text Wrapping

The `wrapText(text, maxChars)` function in `qzTray.ts` handles word-level text wrapping. It splits text on spaces and builds lines up to `maxChars` characters. Words longer than `maxChars` are placed on their own line.
