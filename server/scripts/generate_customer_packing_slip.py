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

STRIP_COLS = {'Price', 'Total', 'Buyout Or Stock?'}


def make_styles():
    base = getSampleStyleSheet()
    return {
        'normal':    ParagraphStyle('NL',  fontName='Helvetica',       fontSize=9,    leading=12),
        'small':     ParagraphStyle('SM',  fontName='Helvetica',       fontSize=7.5,  leading=10),
        'bold':      ParagraphStyle('BL',  fontName='Helvetica-Bold',  fontSize=9,    leading=12),
        'bold_sm':   ParagraphStyle('BS',  fontName='Helvetica-Bold',  fontSize=7.5,  leading=10),
        'head':      ParagraphStyle('HD',  fontName='Helvetica-Bold',  fontSize=11,   leading=14),
        'title':     ParagraphStyle('TT',  fontName='Helvetica-Bold',  fontSize=18,   leading=22, alignment=TA_CENTER),
        'subtitle':  ParagraphStyle('ST',  fontName='Helvetica-Bold',  fontSize=11,   leading=14, alignment=TA_CENTER, textColor=DARK_GRAY),
        'gold_head': ParagraphStyle('GH',  fontName='Helvetica-Bold',  fontSize=9,    leading=12, textColor=GOLD),
        'col_hdr':   ParagraphStyle('CH',  fontName='Helvetica-Bold',  fontSize=7.5,  leading=10, textColor=colors.white, alignment=TA_CENTER),
        'cell':      ParagraphStyle('CE',  fontName='Helvetica',       fontSize=7.5,  leading=10, alignment=TA_CENTER),
        'cell_l':    ParagraphStyle('CL',  fontName='Helvetica',       fontSize=7.5,  leading=10, alignment=TA_LEFT),
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


def build_header(data, styles):
    order_id   = data['orderId']
    order_name = data.get('orderName', f'Order {order_id}')

    P  = lambda txt, st='normal': Paragraph(txt, styles[st])
    PB = lambda txt: Paragraph(txt, styles['bold'])

    flowables = []
    flowables.append(Paragraph("CUSTOMER PACKING SLIP", styles['title']))
    flowables.append(Spacer(1, 4))
    flowables.append(Paragraph("SEND WITH ORDER IN MARKED ENVELOPE", styles['subtitle']))
    flowables.append(Spacer(1, 8))
    flowables.append(HRFlowable(width=USABLE_W, color=GOLD, thickness=2))
    flowables.append(Spacer(1, 6))

    info_rows = [
        [PB("Order Name:"),       P(order_name)],
        [PB("Packing List #:"),   P(str(order_id))],
    ]
    info_table = Table(info_rows, colWidths=[USABLE_W * 0.22, USABLE_W * 0.78])
    info_table.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LINEBELOW',     (0, -1), (-1, -1), 0.5, MID_GRAY),
    ]))
    flowables.append(info_table)
    flowables.append(Spacer(1, 10))
    return flowables


def filter_columns(columns):
    return [c for c in columns if c not in STRIP_COLS]


def col_widths_for(columns):
    total = USABLE_W
    defs = {
        'ID':             total * 0.06,
        'Qty':            total * 0.05,
        'Height':         total * 0.09,
        'Width':          total * 0.09,
        'Length':         total * 0.09,
        'Thickness':      total * 0.09,
        'Edge Left':      total * 0.07,
        'Edge Right':     total * 0.07,
        'Edge Top':       total * 0.07,
        'Edge Bottom':    total * 0.07,
        'type':           total * 0.16,
        'Drawer Boxes':   total * 0.16,
        'Drawer Fronts':  total * 0.16,
        'Shelves/Panels': total * 0.16,
    }
    widths = [defs.get(c, total * 0.09) for c in columns]
    actual = sum(widths)
    scale  = total / actual if actual > 0 else 1
    return [w * scale for w in widths]


def cell_value(col, item):
    def fmt_mm(v):
        if v is None or v == '':
            return ''
        try:
            return f"{float(v):.3f}mm"
        except Exception:
            return str(v)

    mapping = {
        'ID':             str(item.get('id', '')),
        'Qty':            str(item.get('qty', '')),
        'Height':         fmt_mm(item.get('height')),
        'Width':          fmt_mm(item.get('width')),
        'Length':         fmt_mm(item.get('length')),
        'Thickness':      fmt_mm(item.get('thickness')),
        'Edge Left':      str(item.get('edgeLeft', '')),
        'Edge Right':     str(item.get('edgeRight', '')),
        'Edge Top':       str(item.get('edgeTop', '')),
        'Edge Bottom':    str(item.get('edgeBottom', '')),
        'type':           str(item.get('type', '')),
        'Drawer Boxes':   str(item.get('type', '')),
        'Drawer Fronts':  str(item.get('type', '')),
        'Shelves/Panels': str(item.get('type', '')),
    }
    return mapping.get(col, '')


def build_section_flowables(section, styles):
    P  = lambda txt, st='normal': Paragraph(txt, styles[st])
    PB = lambda txt: Paragraph(txt, styles['bold'])

    sku                 = section.get('sku', '')
    raw_columns         = section.get('columns', [])
    columns             = filter_columns(raw_columns)
    items               = section.get('items', [])
    total_items         = section.get('totalItems', 0)
    color               = section.get('color')
    product_description = section.get('productDescription', '')

    flowables = []

    sku_line = Table(
        [[PB(f"{sku}:"), P(product_description)]],
        colWidths=[USABLE_W * 0.35, USABLE_W * 0.65],
    )
    sku_line.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'BOTTOM'),
        ('TOPPADDING',    (0, 0), (-1, -1), 0),
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
    t.setStyle(TableStyle([
        ('BACKGROUND',   (0, 0), (-1, 0),  CHARCOAL),
        ('TEXTCOLOR',    (0, 0), (-1, 0),  colors.white),
        ('FONTNAME',     (0, 0), (-1, 0),  'Helvetica-Bold'),
        ('FONTSIZE',     (0, 0), (-1, -1), 7.5),
        ('ROWBACKGROUNDS',(0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
        ('ALIGN',        (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',   (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 3),
        ('GRID',         (0, 0), (-1, -1), 0.25, MID_GRAY),
        ('LINEBELOW',    (0, 0), (-1, 0),  1, GOLD),
    ]))
    flowables.append(t)

    footer_txt = f"{total_items} Total Items"
    if color:
        footer_txt += f"     Color: {color}"
    footer_line = Table(
        [[P(footer_txt, 'bold_sm')]],
        colWidths=[USABLE_W],
    )
    footer_line.setStyle(TableStyle([
        ('TOPPADDING',    (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    flowables.append(footer_line)
    flowables.append(Spacer(1, 6))

    return flowables


def generate(data):
    output_path = data['outputPath']
    order_id    = data['orderId']
    styles      = make_styles()

    story = []
    story.extend(build_header(data, styles))
    for section in data.get('sections', []):
        story.extend(build_section_flowables(section, styles))

    def make_canvas_factory(oid):
        def factory(*args, **kwargs):
            return NumberedCanvas(*args, order_id=oid, **kwargs)
        return factory

    doc = BaseDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN + 0.2 * inch,
        title=f"Customer Packing Slip #{order_id}",
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
