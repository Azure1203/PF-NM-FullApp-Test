import sys
import json
import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer,
    Table, TableStyle, HRFlowable
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.pdfgen import canvas as rl_canvas

GOLD = colors.HexColor('#CDAB4A')
CHARCOAL = colors.HexColor('#2E2E2E')
LIGHT_GRAY = colors.HexColor('#F7F4F2')
MID_GRAY = colors.HexColor('#E0DEDD')
DARK_GRAY = colors.HexColor('#807161')
RED = colors.HexColor('#CC0000')

PAGE_W, PAGE_H = letter
MARGIN = 0.5 * inch
USABLE_W = PAGE_W - 2 * MARGIN


def make_styles():
    return {
        'normal':    ParagraphStyle('NL',  fontName='Helvetica',       fontSize=9,    leading=12),
        'small':     ParagraphStyle('SM',  fontName='Helvetica',       fontSize=7.5,  leading=10),
        'bold':      ParagraphStyle('BL',  fontName='Helvetica-Bold',  fontSize=9,    leading=12),
        'bold_sm':   ParagraphStyle('BS',  fontName='Helvetica-Bold',  fontSize=7.5,  leading=10),
        'head':      ParagraphStyle('HD',  fontName='Helvetica-Bold',  fontSize=11,   leading=14),
        'title':     ParagraphStyle('TT',  fontName='Helvetica-Bold',  fontSize=18,   leading=22, alignment=TA_CENTER),
        'warning':   ParagraphStyle('WN',  fontName='Helvetica-Bold',  fontSize=12,   leading=16, alignment=TA_CENTER, textColor=RED),
        'col_hdr':   ParagraphStyle('CH',  fontName='Helvetica-Bold',  fontSize=7.5,  leading=10, textColor=colors.white, alignment=TA_CENTER),
        'cell':      ParagraphStyle('CE',  fontName='Helvetica',       fontSize=7.5,  leading=10, alignment=TA_CENTER),
        'cell_l':    ParagraphStyle('CL',  fontName='Helvetica',       fontSize=7.5,  leading=10, alignment=TA_LEFT),
        'cell_r':    ParagraphStyle('CR',  fontName='Helvetica',       fontSize=7.5,  leading=10, alignment=TA_RIGHT),
        'section':   ParagraphStyle('SC',  fontName='Helvetica-Bold',  fontSize=10,   leading=13),
        'totals':    ParagraphStyle('TO',  fontName='Helvetica-Bold',  fontSize=9,    leading=12),
        'sku_label': ParagraphStyle('SK',  fontName='Helvetica',       fontSize=8,    leading=11, textColor=DARK_GRAY),
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
    order_id = data['orderId']
    order_name = data.get('orderName', f'Order {order_id}')

    P = lambda txt, st='normal': Paragraph(txt, styles[st])
    PB = lambda txt: Paragraph(txt, styles['bold'])

    flowables = []
    flowables.append(Paragraph("CUT-TO-SIZE PART LIST", styles['title']))
    flowables.append(Spacer(1, 4))
    flowables.append(Paragraph("*** DO NOT SEND WITH JOB ***", styles['warning']))
    flowables.append(Spacer(1, 8))
    flowables.append(HRFlowable(width=USABLE_W, color=GOLD, thickness=2))
    flowables.append(Spacer(1, 6))

    info_rows = [
        [PB("Job #:"), P(str(order_id)), PB("Project / CNC Label:"), P("_" * 30)],
        [PB("Order Name:"), P(order_name), PB("Notes:"), P("_" * 30)],
    ]
    col_w = [USABLE_W * 0.14, USABLE_W * 0.36, USABLE_W * 0.18, USABLE_W * 0.32]
    info_table = Table(info_rows, colWidths=col_w)
    info_table.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LINEBELOW',     (0, -1), (-1, -1), 0.5, MID_GRAY),
    ]))
    flowables.append(info_table)
    flowables.append(Spacer(1, 12))
    return flowables


def build_length_summary(data, styles):
    P = lambda txt, st='cell': Paragraph(txt, styles[st])
    flowables = []
    flowables.append(Paragraph("Length Summary", styles['section']))
    flowables.append(Spacer(1, 4))

    length_summary = data.get('lengthSummary', [])
    if not length_summary:
        flowables.append(Paragraph("No length summary data.", styles['normal']))
        flowables.append(Spacer(1, 8))
        return flowables

    hdr = [
        Paragraph("Cut Length (mm)", styles['col_hdr']),
        Paragraph("Cut Length (in)", styles['col_hdr']),
        Paragraph("Total Qty", styles['col_hdr']),
        Paragraph("Total Length (mm)", styles['col_hdr']),
    ]
    table_data = [hdr]
    for entry in length_summary:
        cut_mm = entry.get('cutLengthMm', 0)
        cut_in = entry.get('cutLengthIn', 0)
        qty = entry.get('totalQty', 0)
        total_mm = entry.get('totalLengthMm', 0)
        table_data.append([
            P(f"{cut_mm:.1f}"),
            P(f"{cut_in:.3f}"),
            P(str(qty)),
            P(f"{total_mm:.1f}"),
        ])

    col_w = [USABLE_W * 0.25] * 4
    t = Table(table_data, colWidths=col_w, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, 0),  CHARCOAL),
        ('TEXTCOLOR',     (0, 0), (-1, 0),  colors.white),
        ('FONTNAME',      (0, 0), (-1, 0),  'Helvetica-Bold'),
        ('FONTSIZE',      (0, 0), (-1, -1), 7.5),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
        ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('GRID',          (0, 0), (-1, -1), 0.25, MID_GRAY),
        ('LINEBELOW',     (0, 0), (-1, 0),  1, GOLD),
    ]))
    flowables.append(t)
    flowables.append(Spacer(1, 12))
    return flowables


def build_item_detail(data, styles):
    P = lambda txt, st='cell': Paragraph(txt, styles[st])
    flowables = []
    flowables.append(Paragraph("Item Detail", styles['section']))
    flowables.append(Spacer(1, 4))

    items = data.get('items', [])
    if not items:
        flowables.append(Paragraph("No items.", styles['normal']))
        flowables.append(Spacer(1, 8))
        return flowables

    hdr = [
        Paragraph("ID", styles['col_hdr']),
        Paragraph("Qty", styles['col_hdr']),
        Paragraph("Length (mm)", styles['col_hdr']),
        Paragraph("Length (in)", styles['col_hdr']),
        Paragraph("Buyout Or Stock?", styles['col_hdr']),
        Paragraph("Rack Location", styles['col_hdr']),
    ]
    table_data = [hdr]
    for item in items:
        length_mm = item.get('lengthMm', 0)
        length_in = item.get('lengthIn', 0)
        table_data.append([
            P(str(item.get('id', ''))),
            P(str(item.get('qty', ''))),
            P(f"{length_mm:.1f}"),
            P(f"{length_in:.3f}"),
            P(str(item.get('supplyType', ''))),
            P(str(item.get('rackLocation', '') or '')),
        ])

    col_w = [
        USABLE_W * 0.10,
        USABLE_W * 0.08,
        USABLE_W * 0.17,
        USABLE_W * 0.17,
        USABLE_W * 0.22,
        USABLE_W * 0.26,
    ]
    t = Table(table_data, colWidths=col_w, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, 0),  CHARCOAL),
        ('TEXTCOLOR',     (0, 0), (-1, 0),  colors.white),
        ('FONTNAME',      (0, 0), (-1, 0),  'Helvetica-Bold'),
        ('FONTSIZE',      (0, 0), (-1, -1), 7.5),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
        ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('GRID',          (0, 0), (-1, -1), 0.25, MID_GRAY),
        ('LINEBELOW',     (0, 0), (-1, 0),  1, GOLD),
    ]))
    flowables.append(t)
    flowables.append(Spacer(1, 12))
    return flowables


def build_item_totals(data, styles):
    P = lambda txt, st='totals': Paragraph(txt, styles[st])
    flowables = []
    flowables.append(HRFlowable(width=USABLE_W, color=GOLD, thickness=1))
    flowables.append(Spacer(1, 6))

    total_mm = data.get('totalLengthMm', 0)
    total_in = data.get('totalLengthInches', 0)
    total_rods = data.get('totalRodsNeeded', 0)

    totals_rows = [
        [P("Total Length (mm):"), P(f"{total_mm:.1f}")],
        [P("Total Length (inches):"), P(f"{total_in:.3f}")],
        [P("Total Rods Needed:"), P(f"{total_rods:.2f}")],
    ]
    col_w = [USABLE_W * 0.30, USABLE_W * 0.70]
    t = Table(totals_rows, colWidths=col_w)
    t.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('ALIGN',         (1, 0), (1, -1),  'LEFT'),
    ]))
    flowables.append(t)
    flowables.append(Spacer(1, 10))

    sku_code = data.get('skuCode', '')
    if sku_code:
        flowables.append(Paragraph(f"SKU: {sku_code}", styles['sku_label']))
        flowables.append(Spacer(1, 6))

    return flowables


def generate(data):
    output_path = data['outputPath']
    order_id = data['orderId']
    styles = make_styles()

    story = []
    story.extend(build_header(data, styles))
    story.extend(build_length_summary(data, styles))
    story.extend(build_item_detail(data, styles))
    story.extend(build_item_totals(data, styles))

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
        title=f"Cut-to-Size Part List #{order_id}",
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
