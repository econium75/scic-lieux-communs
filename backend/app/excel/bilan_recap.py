"""Export Excel du bilan M2 au format RECAP du Modèle de bilan.xls client.

Reproduit la structure :
- En-tête : nom, référence
- Volumétrie (SHAB, SDP, nb logements) 3 colonnes BRS / PLI / Total
- Dépenses par rubrique avec sous-totaux
- Prix de revient / Prix de vente / Marge nette
"""
from io import BytesIO
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

from .common import (
    BRAND, PAPER_DARK, PAPER_LIGHT, OK, DANGER, INK_DARK,
    MONEY_FMT, header_cell, rubrique_cell, set_column_widths,
)


RUBRIQUE_ORDER = [
    "FONCIER",
    "TRAVAUX BÂTIMENT",
    "HONORAIRES BÂTIMENT",
    "COMMERCIALISATION",
    "GESTION ET MOD",
    "FRAIS FINANCIERS",
]


def build_bilan_recap(bilan: dict) -> BytesIO:
    wb = Workbook()
    ws = wb.active
    ws.title = "RECAP"

    # ---------- En-tête ----------
    ws["A1"] = bilan["nom"].upper()
    ws["A1"].font = Font(bold=True, size=16, color=BRAND)
    ws["A2"] = f"BILAN D'OPÉRATION — {bilan['operation_code']}"
    ws["A2"].font = Font(italic=True, color=INK_DARK)
    ws["A3"] = f"{bilan['commune']} · Livraison {bilan['livraison_cible']}"
    ws["A3"].font = Font(italic=True, color="6B7390", size=9)

    # ---------- Volumétrie ----------
    brs = next((s for s in bilan["sous_bilans"] if s["volet"] == "BRS"), None)
    pli = next((s for s in bilan["sous_bilans"] if s["volet"] == "PLI"), None)

    row = 5
    for h, col in zip(["", f"BRS ({brs['nb_logements'] if brs else 0} lgts)", f"PLI/Béguinage ({pli['nb_logements'] if pli else 0} lgts)", "TOTAL"], ["A", "B", "C", "D"]):
        header_cell(ws[f"{col}{row}"], h)
    row += 1
    for label, key in [("SHAB (m²)", "shab_m2"), ("SDP (m²)", "sdp_m2"), ("Nombre de logements", "nb_logements")]:
        ws.cell(row=row, column=1, value=label).font = Font(bold=True)
        ws.cell(row=row, column=2, value=brs[key] if brs else 0).number_format = '#,##0.00'
        ws.cell(row=row, column=3, value=pli[key] if pli else 0).number_format = '#,##0.00'
        tot = (brs[key] if brs else 0) + (pli[key] if pli else 0)
        ws.cell(row=row, column=4, value=tot).number_format = '#,##0.00'
        row += 1

    row += 2

    # ---------- Dépenses détaillées ----------
    for h, col in zip(["POSTE", "BRS", "PLI/Béguinage", "TOTAL"], ["A", "B", "C", "D"]):
        header_cell(ws[f"{col}{row}"], h)
    row += 1

    # Grouper lignes par rubrique
    by_rub = {r: [] for r in RUBRIQUE_ORDER}
    for l in bilan["lignes"]:
        by_rub.setdefault(l["rubrique"], []).append(l)

    totaux_rub = {t["rubrique"]: t for t in bilan["totaux_rubriques"]}

    for rub in RUBRIQUE_ORDER:
        lignes = by_rub.get(rub, [])
        if not lignes:
            continue
        rubrique_cell(ws.cell(row=row, column=1), rub)
        ws.cell(row=row, column=2).fill = PatternFill("solid", fgColor=PAPER_DARK)
        ws.cell(row=row, column=3).fill = PatternFill("solid", fgColor=PAPER_DARK)
        ws.cell(row=row, column=4).fill = PatternFill("solid", fgColor=PAPER_DARK)
        row += 1

        for lig in lignes:
            ws.cell(row=row, column=1, value=f"  {lig['poste']}")
            if lig.get("ratio_commentaire"):
                ws.cell(row=row, column=1).comment = None  # (commentaire optionnel non géré en openpyxl simple)
            ws.cell(row=row, column=2, value=lig["brs"]).number_format = MONEY_FMT
            ws.cell(row=row, column=3, value=lig["pli"]).number_format = MONEY_FMT
            ws.cell(row=row, column=4, value=lig["total"]).number_format = MONEY_FMT
            row += 1

        # Sous-total rubrique
        tot = totaux_rub.get(rub, {"brs": 0, "pli": 0, "total": 0})
        for col, key, label in [(1, None, f"Sous-total {rub.lower()}"), (2, "brs", None), (3, "pli", None), (4, "total", None)]:
            cell = ws.cell(row=row, column=col)
            cell.font = Font(bold=True, italic=True)
            cell.fill = PatternFill("solid", fgColor=PAPER_LIGHT)
            if key:
                cell.value = tot[key]
                cell.number_format = MONEY_FMT
            else:
                cell.value = label
        row += 1

    row += 1

    # ---------- Prix de revient / Prix de vente / Marge ----------
    def _total_line(label, brs_v, pli_v, total_v, bold_size: int | None = None, color: str = INK_DARK, bg: str | None = None):
        nonlocal row
        for col, val in [(1, label), (2, brs_v), (3, pli_v), (4, total_v)]:
            cell = ws.cell(row=row, column=col)
            cell.value = val
            if bg:
                cell.fill = PatternFill("solid", fgColor=bg)
            if bold_size:
                cell.font = Font(bold=True, size=bold_size, color=color)
            else:
                cell.font = Font(bold=True, color=color)
            if col > 1:
                cell.number_format = MONEY_FMT
                cell.alignment = Alignment(horizontal="right")
        row += 1

    _total_line("PRIX DE REVIENT HT",
                brs["prix_revient_ht"] if brs else 0,
                pli["prix_revient_ht"] if pli else 0,
                bilan["prix_revient_ht_total"],
                bold_size=12, color=BRAND, bg=PAPER_DARK)

    _total_line("Prix de vente HT",
                brs["prix_vente_ht"] if brs else 0,
                pli["prix_vente_ht"] if pli else 0,
                bilan["prix_vente_ht_total"])

    marge_brute_color = DANGER if bilan["marge_brute_totale"] < 0 else INK_DARK
    _total_line("Marge brute (hors subventions)",
                brs["marge_brute"] if brs else 0,
                pli["marge_brute"] if pli else 0,
                bilan["marge_brute_totale"],
                color=marge_brute_color)

    _total_line("+ Subventions",
                brs["subventions"] if brs else 0,
                pli["subventions"] if pli else 0,
                bilan["subventions_totales"],
                color=OK)

    marge_nette_color = DANGER if bilan["marge_nette_totale"] < 0 else OK
    _total_line("MARGE NETTE",
                brs["marge_nette"] if brs else 0,
                pli["marge_nette"] if pli else 0,
                bilan["marge_nette_totale"],
                bold_size=12, color=marge_nette_color, bg=PAPER_DARK)

    # Pct
    ws.cell(row=row, column=1, value="Marge nette %").font = Font(italic=True)
    for col, pct in [(2, brs["marge_nette_pct"] if brs else 0), (3, pli["marge_nette_pct"] if pli else 0), (4, bilan["marge_nette_pct"])]:
        ws.cell(row=row, column=col, value=pct / 100).number_format = "0.00%"
    row += 2

    # ---------- Détail subventions ----------
    if bilan.get("subventions_detail"):
        ws.cell(row=row, column=1, value="DÉTAIL DES SUBVENTIONS INSTITUTIONNELLES").font = Font(bold=True, size=10)
        row += 1
        for col, h in [(1, "Volet"), (2, "Source"), (3, "Montant")]:
            header_cell(ws.cell(row=row, column=col), h)
        row += 1
        for s in bilan["subventions_detail"]:
            ws.cell(row=row, column=1, value=s["volet"])
            ws.cell(row=row, column=2, value=s["source"])
            ws.cell(row=row, column=3, value=s["montant"]).number_format = MONEY_FMT
            row += 1

    # ---------- Alertes ----------
    if bilan.get("alertes"):
        row += 1
        ws.cell(row=row, column=1, value="ALERTES").font = Font(bold=True, size=10)
        row += 1
        for a in bilan["alertes"]:
            sev = a["severity"].upper()
            color = {"critique": DANGER, "attention": "D97706", "info": OK}.get(a["severity"], INK_DARK)
            ws.cell(row=row, column=1, value=f"[{sev}] {a['titre']}").font = Font(bold=True, color=color)
            ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=4)
            row += 1
            ws.cell(row=row, column=1, value=f"  {a['detail']}").font = Font(italic=True, color="6B7390", size=9)
            ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=4)
            row += 1

    set_column_widths(ws, {"A": 46, "B": 20, "C": 22, "D": 20})

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
