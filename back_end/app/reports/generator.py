import io
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak,
)
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics import renderPDF

from .config import (
    REPORT_BRAND_NAME,
    COLOR_PRIMARY, COLOR_ACCENT, COLOR_OK, COLOR_WARN, COLOR_DANGER, COLOR_LIGHT,
)

# ── Color helpers ──────────────────────────────────────────────────────────

def rl_color(rgb):
    return colors.Color(*rgb)

PRIMARY = rl_color(COLOR_PRIMARY)
ACCENT  = rl_color(COLOR_ACCENT)
OK      = rl_color(COLOR_OK)
WARN    = rl_color(COLOR_WARN)
DANGER  = rl_color(COLOR_DANGER)
LIGHT   = rl_color(COLOR_LIGHT)
WHITE   = colors.white
BLACK   = colors.black


# ── Styles ─────────────────────────────────────────────────────────────────

def get_styles():
    base = getSampleStyleSheet()
    return {
        'title': ParagraphStyle(
            'ReportTitle',
            fontName='Helvetica-Bold',
            fontSize=22,
            textColor=PRIMARY,
            spaceAfter=6,
            leading=26,
        ),
        'subtitle': ParagraphStyle(
            'Subtitle',
            fontName='Helvetica',
            fontSize=11,
            textColor=rl_color((0.45, 0.45, 0.45)),
            spaceAfter=16,
        ),
        'section': ParagraphStyle(
            'Section',
            fontName='Helvetica-Bold',
            fontSize=13,
            textColor=PRIMARY,
            spaceBefore=14,
            spaceAfter=8,
            borderPad=4,
        ),
        'body': ParagraphStyle(
            'Body',
            fontName='Helvetica',
            fontSize=9,
            textColor=BLACK,
            leading=13,
        ),
        'small': ParagraphStyle(
            'Small',
            fontName='Helvetica',
            fontSize=8,
            textColor=rl_color((0.5, 0.5, 0.5)),
            leading=11,
        ),
        'kpi_value': ParagraphStyle(
            'KPIValue',
            fontName='Helvetica-Bold',
            fontSize=20,
            textColor=PRIMARY,
            leading=22,
        ),
        'kpi_label': ParagraphStyle(
            'KPILabel',
            fontName='Helvetica',
            fontSize=8,
            textColor=rl_color((0.5, 0.5, 0.5)),
            leading=10,
        ),
    }


# ── KPI box ────────────────────────────────────────────────────────────────

def make_kpi_table(kpis: list) -> Table:
    """
    kpis: list of { label, value, unit, status }
    status: 'ok' | 'warn' | 'danger'
    """
    styles = get_styles()
    cells  = []
    row    = []

    for i, kpi in enumerate(kpis):
        status_color = OK if kpi.get('status') == 'ok' \
            else WARN if kpi.get('status') == 'warn' \
            else DANGER if kpi.get('status') == 'danger' \
            else PRIMARY

        cell_content = [
            Paragraph(f"{kpi['value']}{kpi.get('unit', '')}", styles['kpi_value']),
            Paragraph(kpi['label'], styles['kpi_label']),
        ]
        row.append(cell_content)

        if len(row) == 4 or i == len(kpis) - 1:
            while len(row) < 4:
                row.append('')
            cells.append(row)
            row = []

    t = Table(cells, colWidths=[4.5 * cm] * 4)
    t.setStyle(TableStyle([
        ('BACKGROUND',  (0, 0), (-1, -1), LIGHT),
        ('BOX',         (0, 0), (-1, -1), 0.5, rl_color((0.8, 0.8, 0.8))),
        ('INNERGRID',   (0, 0), (-1, -1), 0.25, WHITE),
        ('TOPPADDING',  (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING',(0, 0), (-1, -1), 10),
        ('VALIGN',      (0, 0), (-1, -1), 'TOP'),
    ]))
    return t


# ── Data table ─────────────────────────────────────────────────────────────

def make_data_table(headers: list, rows: list,
                    col_widths: Optional[list] = None) -> Table:
    header_row = [Paragraph(f'<b>{h}</b>', get_styles()['small']) for h in headers]
    data = [header_row]

    for i, row in enumerate(rows):
        data.append([
            Paragraph(str(cell), get_styles()['body']) if cell is not None else ''
            for cell in row
        ])

    if col_widths is None:
        available = 18 * cm
        col_widths = [available / len(headers)] * len(headers)

    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ('BACKGROUND',   (0, 0), (-1, 0), PRIMARY),
        ('TEXTCOLOR',    (0, 0), (-1, 0), WHITE),
        ('FONTNAME',     (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',     (0, 0), (-1, 0), 8),
        ('TOPPADDING',   (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING',(0, 0), (-1, -1), 5),
        ('LEFTPADDING',  (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('GRID',         (0, 0), (-1, -1), 0.25, rl_color((0.85, 0.85, 0.85))),
        ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(('BACKGROUND', (0, i), (-1, i), LIGHT))
    t.setStyle(TableStyle(style))
    return t


# ── Mini bar chart ─────────────────────────────────────────────────────────

def make_bar_chart(data: list, labels: list,
                   width=400, height=120,
                   bar_color=None) -> Drawing:
    bar_color = bar_color or ACCENT
    d = Drawing(width, height)
    bc = VerticalBarChart()
    bc.x, bc.y       = 40, 10
    bc.width, bc.height = width - 60, height - 20
    bc.data          = [data]
    bc.categoryAxis.categoryNames = labels
    bc.categoryAxis.labels.angle  = 45
    bc.categoryAxis.labels.fontSize = 7
    bc.categoryAxis.labels.dx     = -5
    bc.valueAxis.labelTextFormat   = '%d'
    bc.valueAxis.labels.fontSize   = 7
    bc.bars[0].fillColor           = bar_color
    bc.bars[0].strokeColor         = None
    d.add(bc)
    return d


# ── Main report builder ────────────────────────────────────────────────────

def generate_farm_report(
    report_data: dict,
    report_type: str = 'weekly',
) -> bytes:
    buffer = io.BytesIO()
    styles = get_styles()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title=f'{REPORT_BRAND_NAME} — {report_type.title()} Report',
        author=REPORT_BRAND_NAME,
    )

    story = []

    # ── Cover / header ────────────────────────────────────────────────────
    story.append(Paragraph(REPORT_BRAND_NAME, styles['subtitle']))
    story.append(Paragraph(
        f"{report_type.upper()} PERFORMANCE REPORT — {report_data.get('farm_name', 'All Farms').upper()}",
        styles['title'],
    ))
    story.append(HRFlowable(width='100%', thickness=2, color=ACCENT, spaceAfter=6))

    period_start = report_data.get('period_start', '')[:10]
    period_end   = report_data.get('period_end', '')[:10]
    generated_at = report_data.get('generated_at', datetime.utcnow().isoformat())[:19]
    story.append(Paragraph(
        f'Period: {period_start} to {period_end} &nbsp;&nbsp;·&nbsp;&nbsp; '
        f'Generated: {generated_at} UTC',
        styles['subtitle'],
    ))
    story.append(Spacer(1, 0.3 * cm))

    # ── Executive KPI summary ─────────────────────────────────────────────
    story.append(Paragraph('Executive Summary', styles['section']))
    analytics = report_data.get('analytics', {})
    risk = analytics.get('risk_level', 'NORMAL')

    kpis = [
        {
            'label': 'AVG TEMPERATURE', 'unit': '°C',
            'value': f"{analytics.get('avg_temperature', 0):.1f}",
            'status': 'danger' if analytics.get('avg_temperature', 0) >= 35
                      else 'warn' if analytics.get('avg_temperature', 0) >= 32 else 'ok',
        },
        {
            'label': 'AVG HUMIDITY', 'unit': '%RH',
            'value': f"{analytics.get('avg_humidity', 0):.1f}",
            'status': 'danger' if analytics.get('avg_humidity', 0) >= 85
                      else 'warn' if analytics.get('avg_humidity', 0) >= 75 else 'ok',
        },
        {
            'label': 'AVG AMMONIA', 'unit': 'ppm',
            'value': f"{analytics.get('avg_ammonia', 0):.1f}",
            'status': 'danger' if analytics.get('avg_ammonia', 0) >= 25
                      else 'warn' if analytics.get('avg_ammonia', 0) >= 15 else 'ok',
        },
        {
            'label': 'RISK LEVEL', 'unit': '',
            'value': risk,
            'status': 'danger' if risk in ('HIGH', 'CRITICAL')
                      else 'warn' if risk == 'MEDIUM' else 'ok',
        },
    ]

    efficiency = report_data.get('efficiency', {})
    if efficiency:
        kpis += [
            {
                'label': 'AI AUTOMATION', 'unit': '%',
                'value': f"{efficiency.get('ai_automation_rate', 0):.1f}",
                'status': 'ok' if efficiency.get('ai_automation_rate', 0) >= 80 else 'warn',
            },
            {
                'label': 'TOTAL COMMANDS', 'unit': '',
                'value': str(efficiency.get('total_commands', 0)),
                'status': 'ok',
            },
            {
                'label': 'TOTAL ALERTS', 'unit': '',
                'value': str(report_data.get('alert_patterns', {}).get('total_alerts', 0)),
                'status': 'ok',
            },
            {
                'label': 'MANUAL OVERRIDES', 'unit': '',
                'value': str(efficiency.get('manual_commands', 0)),
                'status': 'ok',
            },
        ]

    story.append(make_kpi_table(kpis))
    story.append(Spacer(1, 0.5 * cm))

    # ── Farm comparison table ─────────────────────────────────────────────
    comparison = report_data.get('comparison', [])
    if comparison:
        story.append(Paragraph('Farm Performance Comparison', styles['section']))
        headers = ['Farm', 'Risk Score', 'Avg Temp', 'Avg NH₃',
                   'Alert Count', 'Device Uptime', 'AI Rate']
        rows = [
            [
                f.get('name', 'N/A'),
                f.get('risk_score', 0),
                f"{f.get('avg_temperature', 0):.1f}°C",
                f"{f.get('avg_ammonia', 0):.1f}ppm",
                f.get('alert_count', 0),
                f"{f.get('device_uptime', 0):.1f}%",
                f"{f.get('ai_override_rate', 0):.1f}%",
            ]
            for f in comparison
        ]
        story.append(make_data_table(
            headers, rows,
            col_widths=[4*cm, 2*cm, 2.2*cm, 2.2*cm, 2.2*cm, 2.5*cm, 2.4*cm],
        ))
        story.append(Spacer(1, 0.5 * cm))

    # ── Alert patterns ────────────────────────────────────────────────────
    alert_patterns = report_data.get('alert_patterns', {})
    if alert_patterns.get('by_metric'):
        story.append(Paragraph('Alert Analysis', styles['section']))

        by_metric = alert_patterns['by_metric']
        metric_labels = [m.get('metric', '').upper() for m in by_metric]
        metric_counts = [m.get('count', 0) for m in by_metric]

        if metric_counts:
            chart = make_bar_chart(metric_counts, metric_labels,
                                   width=250, height=100, bar_color=ACCENT)
            story.append(chart)

        # Top offending devices
        top_devices = alert_patterns.get('top_devices', [])
        if top_devices:
            story.append(Paragraph('Top Alert-Generating Devices', styles['section']))
            headers = ['Device ID', 'House', 'Alert Count']
            rows = [[d.get('device_id', ''), d.get('house_id', ''), d.get('count', 0)] for d in top_devices[:5]]
            story.append(make_data_table(headers, rows,
                                          col_widths=[7*cm, 7*cm, 4*cm]))
        story.append(Spacer(1, 0.5 * cm))

    # ── Operational efficiency ────────────────────────────────────────────
    if efficiency:
        story.append(Paragraph('Operational Efficiency', styles['section']))

        override_reasons = efficiency.get('override_reasons', [])
        if override_reasons:
            story.append(Paragraph('Manual Override Reasons', styles['body']))
            story.append(Spacer(1, 0.2 * cm))
            headers = ['Reason', 'Count', '% of Overrides']
            total_manual = efficiency.get('manual_commands', 1) or 1
            rows = [
                [
                    r.get('reason', ''),
                    r.get('count', 0),
                    f"{r.get('count', 0) / total_manual * 100:.1f}%",
                ]
                for r in override_reasons
            ]
            story.append(make_data_table(headers, rows,
                                          col_widths=[9*cm, 4*cm, 5*cm]))

    # ── Flock performance ─────────────────────────────────────────────────
    flock_data = report_data.get('flock_data', [])
    if flock_data:
        story.append(PageBreak())
        story.append(Paragraph('Flock Performance', styles['section']))
        headers = ['Flock', 'Breed', 'Age', 'Live Count', 'Mortality', 'FCR', 'EPEF', 'Proj. Weight']
        rows = [
            [
                f.get('flock_id', '—'),
                f.get('breed', '—'),
                f"{f.get('age_days', 0)}d",
                f"{f.get('live_count', 0):,}",
                f"{f.get('mortality_rate', 0):.1f}%",
                f.get('fcr', '—'),
                f.get('epef', '—'),
                f"{f.get('projected_weight_g', 0) / 1000:.2f}kg" if f.get('projected_weight_g') else '—',
            ]
            for f in flock_data
        ]
        story.append(make_data_table(
            headers, rows,
            col_widths=[3*cm, 2.5*cm, 1.5*cm, 2*cm, 2*cm, 1.5*cm, 1.5*cm, 3*cm],
        ))

    # ── Footer note ───────────────────────────────────────────────────────
    story.append(Spacer(1, 1 * cm))
    story.append(HRFlowable(width='100%', thickness=0.5,
                             color=rl_color((0.8, 0.8, 0.8)), spaceAfter=6))
    story.append(Paragraph(
        f'This report was automatically generated by {REPORT_BRAND_NAME} on '
        f'{generated_at} UTC. All data reflects the period '
        f'{period_start} to {period_end}.',
        styles['small'],
    ))

    doc.build(story)
    return buffer.getvalue()
