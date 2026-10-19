"""Suivi des projets : paramètres par défaut, champs des modèles, génération des contrats/conventions et des factures (PDF)."""
from __future__ import annotations

import io
import re
from datetime import date

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import KeepTogether, ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table

# ─────────────────────────────────────────────── paramètres par défaut
IDENTITE_DEFAUT = {
    "raison_sociale": "Faire Commun",
    "forme": "SCIC [forme juridique] à capital variable",
    "adresse": "[Adresse du siège]",
    "siret": "[SIRET]",
    "rcs": "[RCS]",
    "tva_intracom": "[N° de TVA intracommunautaire]",
    "representant": "[Nom, fonction]",
    "email": "",
    "telephone": "",
    "iban": "[IBAN]",
    "bic": "[BIC]",
    "delai_paiement_jours": 30,
    "prefixe_facture": "FC",
    "prefixe_avoir": "AV",
    "mention_tva": "",
    "conditions": ("Pénalités de retard : trois fois le taux d'intérêt légal. Indemnité forfaitaire pour frais de recouvrement : "
                   "40 € (art. L.441-10 et D.441-5 du Code de commerce). Pas d'escompte pour paiement anticipé."),
}

# Parcours provisoire, en attente des étapes définies par la SCIC (modifiable par l'administrateur).
PARCOURS_DEFAUT = {
    "provisoire": True,
    "etapes": [
        {"nom": "Cadrage et signature de la convention", "description": "Rencontre, définition du besoin, signature de la convention.",
         "part": 0.20, "modeles": ["Convention d'accompagnement"]},
        {"nom": "Études de faisabilité", "description": "Analyse du site, du programme et des contraintes.", "part": 0.20, "modeles": []},
        {"nom": "Montage et financement", "description": "Montage juridique et financier, dossiers de financement.", "part": 0.20, "modeles": []},
        {"nom": "Suivi des travaux", "description": "Accompagnement pendant le chantier.", "part": 0.25, "modeles": []},
        {"nom": "Livraison et clôture", "description": "Réception, livraison et bilan de la mission.", "part": 0.15, "modeles": []},
    ],
}

MODELES_DEFAUT = [
    {
        "titre": "Convention d'accompagnement",
        "categorie": "convention",
        "contenu": """# Convention d'accompagnement
## {{projet.nom}}

Entre les soussignés :

**{{scic.raison_sociale}}**, {{scic.forme}}, dont le siège est situé {{scic.adresse}}, SIRET {{scic.siret}}, représentée par {{scic.representant}}, ci-après « la SCIC »,

et

**{{client.nom}}**, {{client.adresse}}, SIREN {{client.siren}}, représenté par {{client.contact}}, ci-après « le Bénéficiaire ».

## Article 1 — Objet
La présente convention a pour objet l'accompagnement du Bénéficiaire par la SCIC pour le projet « {{projet.nom}} » (référence {{projet.code}}).

## Article 2 — Déroulement de l'accompagnement
L'accompagnement se déroule selon les étapes suivantes :

{{echeancier}}

## Article 3 — Rémunération
Les honoraires s'élèvent à {{honoraires.ht}} HT, soit {{honoraires.ttc}} TTC (TVA {{honoraires.taux_tva}}). Ils sont facturés à l'achèvement de chaque étape selon la répartition ci-dessus, et payables à {{scic.delai_paiement}} jours.

## Article 4 — Durée
La convention prend effet à sa signature et prend fin à la clôture de la dernière étape.

## Article 5 — Dispositions particulières
[À compléter par la SCIC : confidentialité, propriété des études, résiliation, règlement des litiges.]

Fait en deux exemplaires, le {{date.jour}}.

{{signatures}}
""",
    },
    {
        "titre": "Contrat de mission",
        "categorie": "contrat",
        "contenu": """# Contrat de mission
## {{projet.nom}} — {{projet.code}}

Entre **{{scic.raison_sociale}}**, {{scic.forme}}, {{scic.adresse}}, représentée par {{scic.representant}}, ci-après « le Prestataire »,

et **{{client.nom}}**, {{client.adresse}}, représenté par {{client.contact}}, ci-après « le Maître d'ouvrage ».

## Article 1 — Mission
Le Maître d'ouvrage confie au Prestataire une mission d'assistance pour le projet « {{projet.nom}} »{{operation.mention}}.

## Article 2 — Contenu et calendrier
{{echeancier}}

## Article 3 — Prix
Le prix forfaitaire de la mission est de {{honoraires.ht}} HT ({{honoraires.ttc}} TTC). Chaque étape est facturée à son achèvement.

## Article 4 — Clauses générales
[À compléter par la SCIC.]

Fait le {{date.jour}}.

{{signatures}}
""",
    },
]

# Champs disponibles dans les modèles (affichés dans l'éditeur)
CHAMPS = [
    ("scic.raison_sociale", "Nom de la SCIC"), ("scic.forme", "Forme juridique"), ("scic.adresse", "Adresse du siège"),
    ("scic.siret", "SIRET"), ("scic.representant", "Représentant de la SCIC"), ("scic.delai_paiement", "Délai de paiement (jours)"),
    ("client.nom", "Client / bénéficiaire"), ("client.adresse", "Adresse du client"), ("client.siren", "SIREN du client"),
    ("client.contact", "Signataire côté client"), ("client.email", "E-mail du client"),
    ("projet.nom", "Nom du projet"), ("projet.code", "Référence du projet"), ("projet.date_debut", "Date de début"),
    ("projet.responsable", "Responsable du projet"),
    ("operation.nom", "Opération liée"), ("operation.commune", "Commune de l'opération"),
    ("operation.mention", "« , dans le cadre de l'opération … » (vide si aucune)"),
    ("honoraires.ht", "Honoraires HT"), ("honoraires.tva", "Montant de la TVA"), ("honoraires.ttc", "Honoraires TTC"),
    ("honoraires.taux_tva", "Taux de TVA"),
    ("etape.nom", "Étape (si le document est généré pour une étape)"), ("etape.montant_ht", "Montant HT de l'étape"),
    ("date.jour", "Date du jour"),
    ("echeancier", "Tableau des étapes et de la facturation (sur une ligne seule)"),
    ("signatures", "Cadres de signature (sur une ligne seule)"),
]

BLEU, ENCRE, GRIS, TRAIT, PAPIER = (colors.HexColor("#121A2B"), colors.HexColor("#121826"), colors.HexColor("#667085"),
                                    colors.HexColor("#DAE0E8"), colors.HexColor("#F3F5F8"))
ACCENT = colors.HexColor("#4B52D6")


def eur(v: float) -> str:
    s = f"{v:,.2f}".replace(",", " ").replace(".", ",")
    return f"{s} €"


def pct(v: float) -> str:
    return f"{v * 100:.4g} %".replace(".", ",")


def date_fr(d: date | str | None) -> str:
    if not d:
        return ""
    if isinstance(d, str):
        d = date.fromisoformat(d[:10])
    return d.strftime("%d/%m/%Y")


def fusion(defaut: dict, data: dict | None) -> dict:
    return {**defaut, **{k: v for k, v in (data or {}).items() if v is not None}}


# ─────────────────────────────────────────────── champs et remplissage
def valeurs_champs(projet, identite: dict, operation=None, responsable_nom: str = "", etape: dict | None = None) -> dict[str, str]:
    ht = float(projet.montant_ht or 0)
    tva = round(ht * float(projet.taux_tva or 0), 2)
    v = {
        "scic.raison_sociale": identite["raison_sociale"], "scic.forme": identite["forme"], "scic.adresse": identite["adresse"],
        "scic.siret": identite["siret"], "scic.representant": identite["representant"],
        "scic.delai_paiement": str(identite.get("delai_paiement_jours") or 30),
        "client.nom": projet.client_nom or "[client]", "client.adresse": projet.client_adresse or "[adresse du client]",
        "client.siren": projet.client_siren or "[SIREN]", "client.contact": projet.client_contact or "[signataire]",
        "client.email": projet.client_email or "",
        "projet.nom": projet.nom, "projet.code": projet.code, "projet.date_debut": date_fr(projet.date_debut),
        "projet.responsable": responsable_nom,
        "operation.nom": operation.nom if operation else "", "operation.commune": operation.commune if operation else "",
        "operation.mention": f", dans le cadre de l'opération « {operation.nom} » ({operation.commune})" if operation else "",
        "honoraires.ht": eur(ht), "honoraires.tva": eur(tva), "honoraires.ttc": eur(ht + tva),
        "honoraires.taux_tva": pct(float(projet.taux_tva or 0)),
        "etape.nom": (etape or {}).get("nom", ""),
        "etape.montant_ht": eur(ht * float((etape or {}).get("part") or 0)) if etape else "",
        "date.jour": date_fr(date.today()),
    }
    return v


def remplir(texte: str, valeurs: dict[str, str]) -> str:
    """Remplace les champs {{…}} ; un champ inconnu reste visible entre crochets pour être corrigé."""
    def sub(m: re.Match) -> str:
        cle = m.group(1).strip()
        if cle in ("echeancier", "signatures"):
            return m.group(0)
        return valeurs.get(cle, f"[champ inconnu : {cle}]")
    return re.sub(r"\{\{\s*([\w.]+)\s*\}\}", sub, texte)


# ─────────────────────────────────────────────── rendu PDF
def _styles():
    base = dict(fontName="Helvetica", fontSize=10, leading=14.5, textColor=ENCRE)
    return {
        "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=18, leading=23, textColor=BLEU, alignment=TA_CENTER, spaceAfter=4),
        "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12, leading=16, textColor=BLEU, spaceBefore=10, spaceAfter=4),
        "p": ParagraphStyle("p", **base, spaceAfter=6),
        "petit": ParagraphStyle("petit", fontName="Helvetica", fontSize=8.5, leading=11, textColor=GRIS),
        "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=9, leading=12, textColor=ENCRE),
        "cellb": ParagraphStyle("cellb", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=colors.white),
        "droite": ParagraphStyle("droite", fontName="Helvetica", fontSize=9, leading=12, textColor=ENCRE, alignment=TA_RIGHT),
    }


def _inline(t: str) -> str:
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    return re.sub(r"(\[[^\]]+\])", r'<font backColor="#FFF3B0">\1</font>', t)


def _table_echeancier(projet, st) -> Table:
    ht = float(projet.montant_ht or 0)
    rows = [[Paragraph(x, st["cellb"]) for x in ("Étape", "Part", "Montant HT", "Échéance prévue")]]
    for i, e in enumerate(projet.etapes or [], 1):
        part = float(e.get("part") or 0)
        rows.append([Paragraph(_inline(f"{i}. {e.get('nom', '')}"), st["cell"]), Paragraph(pct(part), st["droite"]),
                     Paragraph(eur(ht * part), st["droite"]), Paragraph(date_fr(e.get("date_prevue")) or "—", st["cell"])])
    rows.append([Paragraph("<b>Total</b>", st["cell"]), Paragraph(f"<b>{pct(sum(float(e.get('part') or 0) for e in projet.etapes or []))}</b>", st["droite"]),
                 Paragraph(f"<b>{eur(ht * sum(float(e.get('part') or 0) for e in projet.etapes or []))}</b>", st["droite"]), ""])
    L = A4[0] - 4 * cm
    return Table(rows, colWidths=[L * 0.52, L * 0.12, L * 0.18, L * 0.18], repeatRows=1, style=[
        ("BACKGROUND", (0, 0), (-1, 0), BLEU), ("GRID", (0, 0), (-1, -1), 0.4, TRAIT), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, -1), (-1, -1), PAPIER), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)],
        spaceBefore=4, spaceAfter=8)


def _table_signatures(identite: dict, projet, st) -> KeepTogether:
    L = A4[0] - 4 * cm

    def bloc(titre, qui):
        return [Paragraph(f"<b>{_inline(titre)}</b>", st["cell"]), Paragraph(_inline(qui), st["petit"]),
                Paragraph("Date et signature", st["petit"]), Spacer(1, 2.4 * cm)]
    t = Table([[bloc(f"Pour {identite['raison_sociale']}", identite["representant"]),
                bloc(f"Pour {projet.client_nom or '[client]'}", projet.client_contact or "[signataire]")]],
              colWidths=[L / 2, L / 2], style=[("BOX", (0, 0), (0, 0), 0.6, TRAIT), ("BOX", (1, 0), (1, 0), 0.6, TRAIT),
                                                ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 8),
                                                ("TOPPADDING", (0, 0), (-1, -1), 6)])
    return KeepTogether([Spacer(1, 6), t])


def _pied(identite: dict, libelle: str):
    def dessin(c, d):
        c.saveState()
        c.setFont("Helvetica", 7.5)
        c.setFillColor(GRIS)
        c.drawString(2 * cm, 1.2 * cm, f"{identite['raison_sociale']} — {identite['forme']} — {identite['adresse']} — SIRET {identite['siret']}"[:140])
        c.drawRightString(A4[0] - 2 * cm, 0.8 * cm, f"{libelle} — page {d.page}")
        c.restoreState()
    return dessin


def document_pdf(titre: str, texte: str, projet, identite: dict) -> bytes:
    """Rend un modèle rempli : « # » titre, « ## » intertitre, « - » puce, **gras**, lignes {{echeancier}} et {{signatures}}."""
    st = _styles()
    h: list = [Paragraph(_inline(identite["raison_sociale"]).upper(), ParagraphStyle("m", fontName="Helvetica-Bold", fontSize=9, textColor=GRIS)),
               Spacer(1, 14)]
    para: list[str] = []
    puces: list[str] = []

    def vider():
        if para:
            h.append(Paragraph(_inline(" ".join(para)), st["p"]))
            para.clear()
        if puces:
            h.append(ListFlowable([ListItem(Paragraph(_inline(x), st["p"]), leftIndent=14, value="•") for x in puces],
                                  bulletType="bullet", start="•", leftIndent=14))
            puces.clear()

    for brut in texte.splitlines():
        ligne = brut.strip()
        if not ligne:
            vider()
        elif ligne == "{{echeancier}}":
            vider()
            h.append(_table_echeancier(projet, st))
        elif ligne == "{{signatures}}":
            vider()
            h.append(_table_signatures(identite, projet, st))
        elif ligne.startswith("## "):
            vider()
            h.append(Paragraph(_inline(ligne[3:]), st["h2"]))
        elif ligne.startswith("# "):
            vider()
            h.append(Paragraph(_inline(ligne[2:]), st["h1"]))
        elif ligne.startswith("- "):
            if para:
                vider()
            puces.append(ligne[2:])
        else:
            if puces:
                vider()
            para.append(ligne)
    vider()
    buf = io.BytesIO()
    pied = _pied(identite, f"{titre} — {projet.code}")
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.8 * cm, bottomMargin=1.8 * cm,
                      title=titre, author=identite["raison_sociale"], creator="Téo").build(h, onFirstPage=pied, onLaterPages=pied)
    return buf.getvalue()


# ─────────────────────────────────────────────── factures
def totaux(lignes: list[dict]) -> tuple[float, float, float]:
    ht = tva = 0.0
    for l in lignes:
        m = round(float(l.get("quantite") or 0) * float(l.get("prix_unitaire_ht") or 0), 2)
        ht += m
        tva += round(m * float(l.get("taux_tva") or 0), 2)
    ht, tva = round(ht, 2), round(tva, 2)
    return ht, tva, round(ht + tva, 2)


def facture_pdf(f, identite: dict, numero_origine: str | None = None) -> bytes:
    st = _styles()
    L = A4[0] - 4 * cm
    avoir = f.type == "avoir"
    brouillon = f.statut == "brouillon"
    nature = "AVOIR" if avoir else "FACTURE"
    titre = nature + (f" N° {f.numero}" if f.numero else "")
    vendeur = [Paragraph(f"<b>{_inline(identite['raison_sociale'])}</b>", ParagraphStyle("v", fontName="Helvetica", fontSize=13, leading=16, textColor=BLEU))]
    for l in (identite["forme"], identite["adresse"], f"SIRET {identite['siret']} — RCS {identite['rcs']}",
              f"TVA intracommunautaire : {identite['tva_intracom']}", " · ".join(x for x in (identite.get("email"), identite.get("telephone")) if x)):
        if l:
            vendeur.append(Paragraph(_inline(l), st["petit"]))
    entete = [Paragraph(nature, ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=BLEU, alignment=TA_RIGHT)),
              Paragraph(f"N° {f.numero}" if f.numero else "BROUILLON — sans valeur",
                        ParagraphStyle("n", fontName="Helvetica-Bold", fontSize=11, leading=15, textColor=ENCRE, alignment=TA_RIGHT))]
    if f.date_emission:
        entete.append(Paragraph(f"Date : {date_fr(f.date_emission)}", st["droite"]))
    if f.date_echeance and not avoir:
        entete.append(Paragraph(f"Échéance : {date_fr(f.date_echeance)}", st["droite"]))
    if avoir and numero_origine:
        entete.append(Paragraph(f"Annule la facture N° {numero_origine}", st["droite"]))
    h: list = [Table([[vendeur, entete]], colWidths=[L * 0.58, L * 0.42], style=[("VALIGN", (0, 0), (-1, -1), "TOP"),
                                                                                 ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)])]
    client = [Paragraph("CLIENT", st["petit"]), Paragraph(f"<b>{_inline(f.client_nom or '[client]')}</b>", st["cell"])]
    for l in (f.client_adresse, f"SIREN {f.client_siren}" if f.client_siren else ""):
        if l:
            client.append(Paragraph(_inline(l).replace("\n", "<br/>"), st["cell"]))
    h += [Spacer(1, 12), Table([["", client]], colWidths=[L * 0.5, L * 0.5], style=[
        ("BACKGROUND", (1, 0), (1, 0), PAPIER), ("BOX", (1, 0), (1, 0), 0.5, TRAIT), ("LEFTPADDING", (1, 0), (1, 0), 8),
        ("TOPPADDING", (1, 0), (1, 0), 6), ("BOTTOMPADDING", (1, 0), (1, 0), 6)]), Spacer(1, 12)]
    if f.objet:
        h.append(Paragraph(f"<b>Objet :</b> {_inline(f.objet)}", st["p"]))
    h.append(Paragraph("Catégorie de l'opération : prestation de services.", st["petit"]))
    h.append(Spacer(1, 6))
    rows = [[Paragraph(x, st["cellb"]) for x in ("Désignation", "Qté", "PU HT", "TVA", "Montant HT")]]
    for l in f.lignes or []:
        m = round(float(l.get("quantite") or 0) * float(l.get("prix_unitaire_ht") or 0), 2)
        rows.append([Paragraph(_inline(l.get("designation", "")), st["cell"]), Paragraph(f"{float(l.get('quantite') or 0):g}".replace(".", ","), st["droite"]),
                     Paragraph(eur(float(l.get("prix_unitaire_ht") or 0)), st["droite"]), Paragraph(pct(float(l.get("taux_tva") or 0)), st["droite"]),
                     Paragraph(eur(m), st["droite"])])
    h.append(Table(rows, colWidths=[L * 0.46, L * 0.08, L * 0.16, L * 0.1, L * 0.2], repeatRows=1, style=[
        ("BACKGROUND", (0, 0), (-1, 0), BLEU), ("GRID", (0, 0), (-1, -1), 0.4, TRAIT), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    tot = [["Total HT", eur(f.total_ht)], ["TVA", eur(f.total_tva)], [f"Total TTC{' à rembourser' if avoir else ' à payer'}", eur(f.total_ttc)]]
    h.append(Table([[Paragraph(a, st["droite"] if i < 2 else ParagraphStyle("tb", parent=st["droite"], fontName="Helvetica-Bold")),
                     Paragraph(b, st["droite"] if i < 2 else ParagraphStyle("tb2", parent=st["droite"], fontName="Helvetica-Bold"))]
                    for i, (a, b) in enumerate(tot)], colWidths=[L * 0.8, L * 0.2],
                   style=[("GRID", (0, 0), (-1, -1), 0.4, TRAIT), ("BACKGROUND", (0, 2), (-1, 2), PAPIER)]))
    h.append(Spacer(1, 12))
    if identite.get("mention_tva"):
        h.append(Paragraph(_inline(identite["mention_tva"]), st["petit"]))
    if not avoir:
        h.append(Paragraph(f"Règlement par virement à {identite.get('delai_paiement_jours') or 30} jours — IBAN {_inline(identite['iban'])} — BIC {_inline(identite['bic'])}.", st["cell"]))
        h.append(Spacer(1, 4))
        h.append(Paragraph(_inline(identite["conditions"]), st["petit"]))
    buf = io.BytesIO()
    pied = _pied(identite, titre)

    def page(c, d):
        pied(c, d)
        if brouillon:
            c.saveState()
            c.setFont("Helvetica-Bold", 60)
            c.setFillColor(colors.Color(0.8, 0.1, 0.1, alpha=0.12))
            c.translate(A4[0] / 2, A4[1] / 2)
            c.rotate(35)
            c.drawCentredString(0, 0, "BROUILLON")
            c.restoreState()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.8 * cm, bottomMargin=1.8 * cm,
                      title=titre, author=identite["raison_sociale"], creator="Téo").build(h, onFirstPage=page, onLaterPages=page)
    return buf.getvalue()
