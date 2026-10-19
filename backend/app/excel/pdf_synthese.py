"""PDF de synthèse pour comité d'engagement (ReportLab).

Format A4 portrait : 1 page avec header, KPIs, alertes, mini-tableaux.
"""
from io import BytesIO
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
)
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER

BRAND = colors.HexColor("#1F3A68")
INK = colors.HexColor("#1A1F2E")
INK_LIGHT = colors.HexColor("#6B7390")
PAPER = colors.HexColor("#F3F2EC")
PAPER_DARK = colors.HexColor("#E8E6DC")
OK = colors.HexColor("#2E7D32")
WARN = colors.HexColor("#D97706")
DANGER = colors.HexColor("#C53030")


def _fmt_euro(v: float, compact: bool = False) -> str:
    if compact:
        if abs(v) >= 1_000_000:
            return f"{v/1_000_000:.2f} M€".replace(".", ",")
        if abs(v) >= 1_000:
            return f"{v/1_000:,.0f} k€".replace(",", " ")
    return f"{v:,.0f} €".replace(",", " ")


def _fmt_pct(v: float) -> str:
    return f"{v:.2f} %".replace(".", ",")


def build_pdf_synthese(bilan: dict, exploit: dict | None, scenario_nom: str) -> BytesIO:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=15 * mm, bottomMargin=15 * mm,
        leftMargin=15 * mm, rightMargin=15 * mm,
        title=f"Synthèse {bilan['nom']}",
        author="Téo — SCIC Faire Commun",
    )

    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Title"], fontSize=18, textColor=BRAND,
                        spaceAfter=4, fontName="Helvetica-Bold", alignment=TA_LEFT)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=10, textColor=INK_LIGHT,
                        spaceAfter=12, fontName="Helvetica", alignment=TA_LEFT)
    sect = ParagraphStyle("sect", parent=styles["Heading3"], fontSize=9, textColor=INK_LIGHT,
                          spaceAfter=4, fontName="Helvetica-Bold", alignment=TA_LEFT, textTransform="uppercase")
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=INK_LIGHT)
    norm = ParagraphStyle("n", parent=styles["Normal"], fontSize=9, textColor=INK)

    story = []

    # ---------- Header ----------
    story.append(Paragraph("SCIC FAIRE COMMUN — SYNTHÈSE D'OPÉRATION", h2))
    story.append(Paragraph(bilan["nom"], h1))
    sub = (
        f"{bilan['commune']} · Livraison {bilan['livraison_cible']} · "
        f"{bilan['nb_logements_total']} logements · Scénario : {scenario_nom}"
    )
    story.append(Paragraph(sub, h2))

    # ---------- KPIs ----------
    story.append(Paragraph("Indicateurs clés", sect))
    kpi_data = [
        ["Prix de revient HT", _fmt_euro(bilan["prix_revient_ht_total"], compact=True),
         "Marge nette", _fmt_euro(bilan["marge_nette_totale"], compact=True)],
        ["Prix de vente HT", _fmt_euro(bilan["prix_vente_ht_total"], compact=True),
         "Marge nette %", _fmt_pct(bilan["marge_nette_pct"])],
        ["Marge brute (pré-subv.)", _fmt_euro(bilan["marge_brute_totale"], compact=True),
         "Subventions totales", _fmt_euro(bilan["subventions_totales"], compact=True)],
    ]
    if exploit:
        kpi_data.append([
            "Loyer d'équilibre", f"{exploit['loyer_equilibre_m2_mois']} €/m²/mois".replace(".", ","),
            "CAF année 1", _fmt_euro(exploit["caf_annee_1"], compact=True),
        ])
    t = Table(kpi_data, colWidths=[45*mm, 40*mm, 45*mm, 40*mm])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), INK_LIGHT),
        ("TEXTCOLOR", (2, 0), (2, -1), INK_LIGHT),
        ("TEXTCOLOR", (1, 0), (1, -1), INK),
        ("TEXTCOLOR", (3, 0), (3, -1), INK),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("GRID", (0, 0), (-1, -1), 0.3, PAPER_DARK),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        # Color marge nette according to sign
        ("TEXTCOLOR", (3, 0), (3, 0), OK if bilan["marge_nette_totale"] >= 0 else DANGER),
        ("TEXTCOLOR", (1, 2), (1, 2), DANGER if bilan["marge_brute_totale"] < 0 else INK),
    ]))
    story.append(t)
    story.append(Spacer(1, 6*mm))

    # ---------- Ventilation par rubrique ----------
    story.append(Paragraph("Ventilation du prix de revient par rubrique", sect))
    rub_data = [["Rubrique", "BRS", "PLI/Béguinage", "Total"]]
    for tr in bilan["totaux_rubriques"]:
        rub_data.append([
            tr["rubrique"],
            _fmt_euro(tr["brs"]),
            _fmt_euro(tr["pli"]),
            _fmt_euro(tr["total"]),
        ])
    rub_data.append([
        "PRIX DE REVIENT HT",
        _fmt_euro(bilan["sous_bilans"][0]["prix_revient_ht"]) if bilan["sous_bilans"] else "—",
        _fmt_euro(bilan["sous_bilans"][1]["prix_revient_ht"]) if len(bilan["sous_bilans"]) > 1 else "—",
        _fmt_euro(bilan["prix_revient_ht_total"]),
    ])
    t2 = Table(rub_data, colWidths=[55*mm, 35*mm, 40*mm, 40*mm])
    t2.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.3, PAPER_DARK),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), PAPER_DARK),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t2)
    story.append(Spacer(1, 6*mm))

    # ---------- Alertes ----------
    if bilan.get("alertes"):
        story.append(Paragraph("Alertes", sect))
        for a in bilan["alertes"]:
            sev_color = {"critique": DANGER, "attention": WARN, "info": OK}.get(a["severity"], INK)
            tag = f'<font color="{sev_color.hexval()}"><b>[{a["severity"].upper()}]</b></font>'
            story.append(Paragraph(f"{tag} <b>{a['titre']}</b>", norm))
            story.append(Paragraph(a["detail"], small))
            story.append(Spacer(1, 2*mm))
    if exploit and exploit.get("alertes"):
        for a in exploit["alertes"]:
            sev_color = {"critique": DANGER, "attention": WARN, "info": OK}.get(a["severity"], INK)
            tag = f'<font color="{sev_color.hexval()}"><b>[{a["severity"].upper()}]</b></font>'
            story.append(Paragraph(f"{tag} <b>M3 — {a['titre']}</b>", norm))
            story.append(Paragraph(a["detail"], small))
            story.append(Spacer(1, 2*mm))

    story.append(Spacer(1, 8*mm))

    # ---------- Footer ----------
    story.append(Paragraph(
        f"Document généré automatiquement le {datetime.now().strftime('%d/%m/%Y à %H:%M')} par le "
        f"Téo — SCIC Faire Commun. "
        f"Confidentiel. Ne constitue pas un engagement contractuel.",
        small,
    ))

    doc.build(story)
    buf.seek(0)
    return buf
