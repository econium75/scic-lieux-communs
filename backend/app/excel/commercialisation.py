"""Export Excel du tableau de commercialisation M4 — tous les ménages du scenario."""
from io import BytesIO
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

from .common import (
    BRAND, PAPER_DARK, OK, DANGER, WARN, INK_DARK,
    MONEY_FMT, header_cell, set_column_widths,
)


def build_commercialisation(menages_with_qualif: list[dict]) -> BytesIO:
    """menages_with_qualif = [{menage, qualification}]"""
    wb = Workbook()
    ws = wb.active
    ws.title = "Commercialisation BRS"

    ws["A1"] = "TABLEAU DE COMMERCIALISATION BRS"
    ws["A1"].font = Font(bold=True, size=14, color=BRAND)
    ws["A2"] = "Qualification ménage par ménage : décile FiLoSoFi, décote BRS, subvention ANRU, plan de financement"
    ws["A2"].font = Font(italic=True, color="6B7390", size=9)

    headers = [
        "Réf.", "Typo", "UC",
        "Rev. activités", "CAF /mois", "Revenu dispo /an", "Revenu /UC /an",
        "Décile", "PV base", "Décote %", "PV après décote",
        "Sub. ANRU", "Prix net", "Apport", "Capital emprunté",
        "PTZ", "Mens. PTZ", "Prêt compl.", "Taux PC", "Mens. PC",
        "Mens. totale", "Taux effort %", "Reste à vivre /UC /jour",
        "Verdict", "Motifs",
    ]
    row = 4
    for col, h in enumerate(headers, start=1):
        header_cell(ws.cell(row=row, column=col), h)
    row += 1

    for item in menages_with_qualif:
        m = item.get("menage", {})
        q = item.get("qualification")
        if not q:
            continue
        verdict_color = {"eligible": OK, "limite": WARN, "non_eligible": DANGER}.get(q["verdict"], INK_DARK)
        vals = [
            q["reference"], q["typologie"], q["uc"],
            m.get("revenu_fiscal_annuel", 0),
            m.get("prestations_sociales_mensuelles", 0),
            q["revenu_disponible_annuel"],
            q["revenu_par_uc_annuel"],
            q["decile"], q["prix_vente_base"], q["decote_pct"], q["prix_vente_apres_decote"],
            q["subvention_anru"], q["prix_net_a_financer"], q["apport"], q["capital_emprunte"],
            q["montant_ptz"], q["mensualite_ptz"],
            q["montant_pc"], q["taux_pc_pct"], q["mensualite_pc"],
            q["mensualite_totale"], q["taux_effort_pct"], q["reste_a_vivre_par_uc_jour"],
            q["verdict"].upper(), " · ".join(q["motifs"]),
        ]
        for col, v in enumerate(vals, start=1):
            cell = ws.cell(row=row, column=col, value=v)
            if col in (4, 5, 6, 7, 9, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21):
                cell.number_format = MONEY_FMT
            if col == 24:
                cell.font = Font(bold=True, color=verdict_color)
            if col == 22 and q["taux_effort_pct"] > 33:
                cell.font = Font(color=DANGER)
        row += 1

    set_column_widths(ws, {
        "A": 10, "B": 6, "C": 6,
        "D": 14, "E": 10, "F": 14, "G": 14,
        "H": 8, "I": 12, "J": 10, "K": 15,
        "L": 12, "M": 13, "N": 11, "O": 15,
        "P": 11, "Q": 11, "R": 13, "S": 10, "T": 11,
        "U": 13, "V": 13, "W": 20,
        "X": 15, "Y": 60,
    })

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
