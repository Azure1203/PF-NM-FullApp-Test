import sys
import json
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer,
    Table, TableStyle, HRFlowable
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfgen import canvas as rl_canvas

BLACK     = colors.HexColor('#000000')
DARK_GRAY = colors.HexColor('#333333')
MID_GRAY  = colors.HexColor('#CCCCCC')
LIGHT_GRAY= colors.HexColor('#F5F5F5')

PAGE_W, PAGE_H = letter
MARGIN  = 0.5 * inch
USABLE_W = PAGE_W - 2 * MARGIN


def make_styles():
    return {
        'normal':   ParagraphStyle('NL',  fontName='Helvetica',      fontSize=9,  leading=12),
        'small':    ParagraphStyle('SM',  fontName='Helvetica',      fontSize=7.5,leading=10),
        'bold':     ParagraphStyle('BL',  fontName='Helvetica-Bold', fontSize=9,  leading=12),
        'bold_lg':  ParagraphStyle('BG',  fontName='Helvetica-Bold', fontSize=14, leading=18),
        'title':    ParagraphStyle('TT',  fontName='Helvetica-Bold', fontSize=16, leading=20),
        'col_hdr':  ParagraphStyle('CH',  fontName='Helvetica-Bold', fontSize=8,  leading=10, textColor=colors.white, alignment=TA_CENTER),
        'cell':     ParagraphStyle('CE',  fontName='Helvetica',      fontSize=8,  leading=10, alignment=TA_CENTER),
        'cell_l':   ParagraphStyle('CL',  fontName='Helvetica',      fontSize=8,  leading=10, alignment=TA_LEFT),
        'bold_sm':  ParagraphStyle('BS',  fontName='Helvetica-Bold', fontSize=7.5,leading=10),
        'subtitle': ParagraphStyle('SU',  fontName='Helvetica',      fontSize=9,  leading=12, textColor=DARK_GRAY),
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
            self._draw_footer(num_pages)
            rl_canvas.Canvas.showPage(self)
        rl_canvas.Canvas.save(self)

    def _draw_footer(self, total):
        self.saveState()
        self.setFont('Helvetica', 7.5)
        self.setFillColor(DARK_GRAY)
        text = f"Order #{self._order_id}   Page {self._pageNumber} of {total}"
        self.drawCentredString(PAGE_W / 2, 0.25 * inch, text)
        self.restoreState()


def build_header(data, styles):
    order_id     = data['orderId']
    order_name   = data.get('orderName', f'Order {order_id}')
    project_label= data.get('projectLabel', '')

    P  = lambda txt, st='normal': Paragraph(txt, styles[st])
    PB = lambda txt: Paragraph(txt, styles['bold'])

    flowables = []
    flowables.append(Paragraph("Elias PF Dovetail Drawers", styles['title']))
    flowables.append(Spacer(1, 4))
    flowables.append(Paragraph(f"Job #{order_id}", styles['bold_lg']))
    flowables.append(Spacer(1, 8))
    flowables.append(HRFlowable(width=USABLE_W, color=BLACK, thickness=1.5))
    flowables.append(Spacer(1, 6))

    info_rows = [
        [PB("Order Name:"),            P(order_name)],
        [PB("PROJECT & CV LABEL #:"),  P(project_label)],
    ]
    info_table = Table(info_rows, colWidths=[USABLE_W * 0.28, USABLE_W * 0.72])
    info_table.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    flowables.append(info_table)
    flowables.append(Spacer(1, 6))

    notes_label = Table(
        [[PB("Notes:"), P("")]],
        colWidths=[USABLE_W * 0.12, USABLE_W * 0.88],
    )
    notes_label.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW',     (1, 0), (1, 0), 0.5, MID_GRAY),
        ('TOPPADDING',    (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))
    flowables.append(notes_label)
    flowables.append(HRFlowable(width=USABLE_W, color=MID_GRAY, thickness=0.5))
    flowables.append(Spacer(1, 10))
    return flowables


def build_section(section, styles):
    P  = lambda txt, st='normal': Paragraph(txt, styles[st])
    PB = lambda txt: Paragraph(txt, styles['bold'])

    sku                  = section.get('sku', '')
    color                = section.get('color', '')
    supplier_checkmarks  = section.get('supplierCheckmarks', 1)
    items                = section.get('items', [])
    total_items          = section.get('totalItems', 0)

    flowables = []

    checkmarks_str = '  '.join(['✓' if False else 'X'] * supplier_checkmarks)
    supplier_row = Table(
        [[PB("Supplier:"), P("Elias"), PB(""), P(checkmarks_str)]],
        colWidths=[USABLE_W * 0.12, USABLE_W * 0.25, USABLE_W * 0.08, USABLE_W * 0.55],
    )
    supplier_row.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('FONTSIZE',      (3, 0), (3, 0), 11),
    ]))
    flowables.append(supplier_row)

    COLS = ['ID', 'Qty', 'Height', 'Width', 'Length', 'Drawer Boxes']
    col_w_defs = {
        'ID':           USABLE_W * 0.07,
        'Qty':          USABLE_W * 0.06,
        'Height':       USABLE_W * 0.14,
        'Width':        USABLE_W * 0.14,
        'Length':       USABLE_W * 0.14,
        'Drawer Boxes': USABLE_W * 0.45,
    }
    col_ws = [col_w_defs[c] for c in COLS]

    hdr_row = [Paragraph(c, styles['col_hdr']) for c in COLS]
    table_data = [hdr_row]

    def fmt_mm(v):
        if v is None or v == '':
            return ''
        try:
            return f"{float(v):.3f}mm"
        except Exception:
            return str(v)

    for item in items:
        row = [
            Paragraph(str(item.get('id', '')),   styles['cell']),
            Paragraph(str(item.get('qty', '')),   styles['cell']),
            Paragraph(fmt_mm(item.get('height')), styles['cell']),
            Paragraph(fmt_mm(item.get('width')),  styles['cell']),
            Paragraph(fmt_mm(item.get('length')), styles['cell']),
            Paragraph(str(item.get('type', 'Dovetail Drawer Box')), styles['cell_l']),
        ]
        table_data.append(row)

    t = Table(table_data, colWidths=col_ws, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, 0),  DARK_GRAY),
        ('TEXTCOLOR',     (0, 0), (-1, 0),  colors.white),
        ('FONTNAME',      (0, 0), (-1, 0),  'Helvetica-Bold'),
        ('FONTSIZE',      (0, 0), (-1, -1), 8),
        ('ROWBACKGROUNDS',(0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
        ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
        ('ALIGN',         (5, 1), (5, -1),  'LEFT'),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('GRID',          (0, 0), (-1, -1), 0.25, MID_GRAY),
        ('LINEBELOW',     (0, 0), (-1, 0),  1, BLACK),
    ]))
    flowables.append(t)

    footer_table = Table(
        [[P(f"{total_items} Total Items", 'bold_sm'), PB(f"SKU: {sku}"), PB(f"Color: {color}")]],
        colWidths=[USABLE_W * 0.35, USABLE_W * 0.35, USABLE_W * 0.30],
    )
    footer_table.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('ALIGN',         (1, 0), (1, 0),   'CENTER'),
        ('ALIGN',         (2, 0), (2, 0),   'RIGHT'),
    ]))
    flowables.append(footer_table)
    flowables.append(HRFlowable(width=USABLE_W, color=MID_GRAY, thickness=0.5))
    flowables.append(Spacer(1, 8))

    return flowables


def generate(data):
    output_path = data['outputPath']
    order_id    = data['orderId']
    styles      = make_styles()

    story = []
    story.extend(build_header(data, styles))
    for section in data.get('sections', []):
        story.extend(build_section(section, styles))

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
        title=f"Elias PF Dovetail Drawers - Order #{order_id}",
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
