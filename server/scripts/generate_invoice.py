import sys
import json
import os
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer,
    Table, TableStyle, HRFlowable, KeepTogether, PageBreak
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas as rl_canvas

GOLD = colors.HexColor('#CDAB4A')
CHARCOAL = colors.HexColor('#2E2E2E')
LIGHT_GRAY = colors.HexColor('#F7F4F2')
MID_GRAY = colors.HexColor('#E0DEDD')
DARK_GRAY = colors.HexColor('#807161')

PAGE_W, PAGE_H = letter
MARGIN = 0.5 * inch
USABLE_W = PAGE_W - 2 * MARGIN

COMPANY_NAME = "Netley Millwork"
COMPANY_ADDR = ["Unit 70 – 32 Royal Road N", "Winnipeg, MB  R3J 1H4", "Ph: (204) 489-5353"]
BILL_TO_LINES = ["Perfect Fit Closet Solutions", "Unit 101 – 2696 Inkster Blvd", "Winnipeg, MB  R2X 2W8"]


def make_styles():
    base = getSampleStyleSheet()
    return {
        'normal': ParagraphStyle('NL', fontName='Helvetica', fontSize=9, leading=12),
        'small':  ParagraphStyle('SM', fontName='Helvetica', fontSize=7.5, leading=10),
        'bold':   ParagraphStyle('BL', fontName='Helvetica-Bold', fontSize=9, leading=12),
        'bold_sm':ParagraphStyle('BS', fontName='Helvetica-Bold', fontSize=7.5, leading=10),
        'head':   ParagraphStyle('HD', fontName='Helvetica-Bold', fontSize=11, leading=14),
        'gold_head': ParagraphStyle('GH', fontName='Helvetica-Bold', fontSize=9, leading=12, textColor=GOLD),
        'col_hdr': ParagraphStyle('CH', fontName='Helvetica-Bold', fontSize=7.5, leading=10, textColor=colors.white, alignment=TA_CENTER),
        'cell':    ParagraphStyle('CE', fontName='Helvetica', fontSize=7.5, leading=10, alignment=TA_CENTER),
        'cell_l':  ParagraphStyle('CL', fontName='Helvetica', fontSize=7.5, leading=10, alignment=TA_LEFT),
    }


class NumberedCanvas(rl_canvas.Canvas):
    def __init__(self, *args, order_id=None, **kwargs):
        rl_canvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []
        self._order_id = order_id

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_page_footer(num_pages)
            rl_canvas.Canvas.showPage(self)
        rl_canvas.Canvas.save(self)

    def _draw_page_footer(self, total):
        self.saveState()
        self.setFont('Helvetica', 7.5)
        self.setFillColor(DARK_GRAY)
        text = f"Order #{self._order_id}   Page {self._pageNumber} of {total}"
        self.drawCentredString(PAGE_W / 2, 0.25 * inch, text)
        self.restoreState()


def build_header_table(data, styles):
    order_id = data['orderId']
    order_name = data['orderName']
    order_status = data['orderStatus']
    payment_due_by = data.get('paymentDueBy', '')
    projected_ship_date = data.get('projectedShipDate', '')
    shipping_method = data.get('shippingMethod', 'Will Call')
    ship_to = data.get('shipTo', 'Will Call')
    date_ordered = data.get('dateOrdered', datetime.now().strftime('%m/%d/%Y'))

    P = lambda txt, st='normal': Paragraph(txt, styles[st])
    PB = lambda txt: Paragraph(txt, styles['bold'])

    company_block = [
        PB(COMPANY_NAME),
    ] + [P(line) for line in COMPANY_ADDR]

    order_ref_block = [
        P(f"<b>Order #:</b> {order_id}", 'normal'),
        P(f"<b>Bid #:</b> {order_id}", 'normal'),
    ]

    bill_to_block = [PB("Bill To:")] + [P(line) for line in BILL_TO_LINES]
    ship_to_block = [PB("Ship To:")] + [P(ship_to)]

    col1 = company_block
    col2 = order_ref_block

    top_table = Table(
        [[col1, col2]],
        colWidths=[USABLE_W * 0.65, USABLE_W * 0.35],
    )
    top_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))

    addr_table = Table(
        [[bill_to_block, ship_to_block]],
        colWidths=[USABLE_W * 0.5, USABLE_W * 0.5],
    )
    addr_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))

    details = [
        [PB("Order Name:"), P(order_name), PB("Order Status:"), P(order_status)],
        [PB("Date Ordered:"), P(date_ordered), PB("Payment Due By:"), P(payment_due_by)],
        [PB("Projected Ship Date:"), P(projected_ship_date), PB("Shipping Method:"), P(shipping_method)],
        [PB("Project & CNC Label #:"), P(""), P(""), P("")],
    ]
    details_table = Table(
        details,
        colWidths=[USABLE_W * 0.22, USABLE_W * 0.28, USABLE_W * 0.22, USABLE_W * 0.28],
    )
    details_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LINEBELOW', (0, -1), (-1, -1), 0.5, MID_GRAY),
    ]))

    return [top_table, Spacer(1, 6), addr_table, HRFlowable(width=USABLE_W, color=GOLD, thickness=1.5), Spacer(1, 4), details_table, Spacer(1, 8)]


def col_widths_for(columns):
    total = USABLE_W
    defs = {
        'ID':               total * 0.06,
        'Qty':              total * 0.05,
        'Height':           total * 0.08,
        'Width':            total * 0.08,
        'Length':           total * 0.08,
        'Thickness':        total * 0.08,
        'Edge Left':        total * 0.06,
        'Edge Right':       total * 0.06,
        'Edge Top':         total * 0.06,
        'Edge Bottom':      total * 0.06,
        'Drawer Boxes':     total * 0.14,
        'Drawer Fronts':    total * 0.14,
        'Shelves/Panels':   total * 0.14,
        'type':             total * 0.14,
        'Buyout Or Stock?': total * 0.10,
        'Price':            total * 0.08,
        'Total':            total * 0.09,
    }
    widths = [defs.get(c, total * 0.08) for c in columns]
    actual = sum(widths)
    scale = total / actual if actual > 0 else 1
    return [w * scale for w in widths]


def cell_value(col, item):
    def fmt_mm(v):
        if v is None or v == '':
            return ''
        try:
            return f"{float(v):.3f}mm"
        except Exception:
            return str(v)

    def fmt_money(v):
        if v is None or v == '':
            return ''
        try:
            return f"${float(v):,.2f}"
        except Exception:
            return str(v)

    mapping = {
        'ID':               str(item.get('id', '')),
        'Qty':              str(item.get('qty', '')),
        'Height':           fmt_mm(item.get('height')),
        'Width':            fmt_mm(item.get('width')),
        'Length':           fmt_mm(item.get('length')),
        'Thickness':        fmt_mm(item.get('thickness')),
        'Edge Left':        str(item.get('edgeLeft', '')),
        'Edge Right':       str(item.get('edgeRight', '')),
        'Edge Top':         str(item.get('edgeTop', '')),
        'Edge Bottom':      str(item.get('edgeBottom', '')),
        'Drawer Boxes':     str(item.get('type', '')),
        'Drawer Fronts':    str(item.get('type', '')),
        'Shelves/Panels':   str(item.get('type', '')),
        'type':             str(item.get('type', '')),
        'Buyout Or Stock?': str(item.get('supplyType', 'Stock')),
        'Price':            fmt_money(item.get('unitPrice')),
        'Total':            fmt_money(item.get('totalPrice')),
    }
    return mapping.get(col, '')


def build_section_flowables(section, styles):
    P = lambda txt, st='normal': Paragraph(txt, styles[st])
    PB = lambda txt: Paragraph(txt, styles['bold'])

    sku = section.get('sku', '')
    columns = section.get('columns', [])
    items = section.get('items', [])
    total_items = section.get('totalItems', 0)
    subtotal = section.get('subtotal', 0.0)
    color = section.get('color')
    product_description = section.get('productDescription', '')

    flowables = []

    sku_line = Table(
        [[PB(f"{sku}:"), P(product_description)]],
        colWidths=[USABLE_W * 0.35, USABLE_W * 0.65],
    )
    sku_line.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    flowables.append(sku_line)

    col_w = col_widths_for(columns)
    hdr_row = [Paragraph(c, styles['col_hdr']) for c in columns]
    table_data = [hdr_row]
    for item in items:
        row = [Paragraph(cell_value(col, item), styles['cell']) for col in columns]
        table_data.append(row)

    t = Table(table_data, colWidths=col_w, repeatRows=1)
    ts = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), CHARCOAL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('GRID', (0, 0), (-1, -1), 0.25, MID_GRAY),
        ('LINEBELOW', (0, 0), (-1, 0), 1, GOLD),
    ])
    t.setStyle(ts)
    flowables.append(t)

    footer_parts = [f"{total_items} Total Items", f"  ${subtotal:,.2f}"]
    if color:
        footer_parts.append(f"     Color: {color}")
    footer_line = Table(
        [[P("  ".join(footer_parts), 'bold_sm'), P(f"Section Subtotal: ${subtotal:,.2f}", 'bold_sm')]],
        colWidths=[USABLE_W * 0.6, USABLE_W * 0.4],
    )
    footer_line.setStyle(TableStyle([
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    flowables.append(footer_line)
    flowables.append(Spacer(1, 6))

    return flowables


def build_totals_flowable(data, styles):
    P = lambda txt, st='normal': Paragraph(txt, styles[st])
    PB = lambda txt: Paragraph(txt, styles['bold'])

    original_total = data.get('originalTotal', 0.0)
    discount_amount = data.get('discountAmount', 0.0)
    final_total = data.get('finalTotal', 0.0)

    rows = [
        [PB("ORIGINAL TOTAL:"), P(f"${original_total:,.2f}")],
        [PB("DISCOUNT AMOUNT:"), P(f"${discount_amount:,.2f}")],
        [PB("FINAL ORDER TOTAL:"), P(f"${final_total:,.2f}")],
    ]
    t = Table(rows, colWidths=[USABLE_W * 0.5, USABLE_W * 0.5])
    t.setStyle(TableStyle([
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LINEABOVE', (0, 0), (-1, 0), 1, GOLD),
        ('LINEBELOW', (0, -1), (-1, -1), 1.5, CHARCOAL),
        ('BACKGROUND', (0, -1), (-1, -1), LIGHT_GRAY),
    ]))
    return [Spacer(1, 12), HRFlowable(width=USABLE_W, color=GOLD, thickness=1), Spacer(1, 4), t]


def generate(data):
    output_path = data['outputPath']
    order_id = data['orderId']
    styles = make_styles()

    story = []
    story.extend(build_header_table(data, styles))
    for section in data.get('sections', []):
        story.extend(build_section_flowables(section, styles))
    story.extend(build_totals_flowable(data, styles))

    def make_canvas_factory(order_id):
        def factory(*args, **kwargs):
            return NumberedCanvas(*args, order_id=order_id, **kwargs)
        return factory

    doc = BaseDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN + 0.2 * inch,
        title=f"Invoice #{order_id}",
        author=COMPANY_NAME,
    )
    frame = Frame(MARGIN, MARGIN + 0.2 * inch, USABLE_W, PAGE_H - 2 * MARGIN - 0.2 * inch, id='normal')
    doc.addPageTemplates([PageTemplate(id='All', frames=frame)])
    doc.build(story, canvasmaker=make_canvas_factory(order_id))
    return output_path


if __name__ == '__main__':
    try:
        data = json.load(sys.stdin)
        path = generate(data)
        print(f"SUCCESS:{path}")
        sys.stdout.flush()
    except Exception as e:
        import traceback
        print(f"ERROR:{e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
