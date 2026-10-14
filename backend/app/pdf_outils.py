"""Outils PDF du porte-documents : rendu des pages, annotations, signature, certificat.

Les positions des annotations sont exprimées en fractions (0–1) de la page telle qu'elle
s'affiche (coin haut-gauche = 0,0), ce qui les rend indépendantes de la résolution d'affichage.
Les pages tournées sont normalisées (rotation transférée au contenu) avant d'être annotées,
pour que l'affichage (pdfium) et l'écriture (pypdf + reportlab) partagent le même repère.
"""
from __future__ import annotations

import base64
import hashlib
from datetime import datetime, timezone
from io import BytesIO
from typing import Any

import pypdfium2 as pdfium
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

TYPES_ANNOTATION = {"texte", "signature", "paraphe", "date", "coche", "surlignage", "masque"}


class ErreurPdf(ValueError):
    pass


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def est_pdf(data: bytes) -> bool:
    return data[:1024].lstrip().startswith(b"%PDF")


def _lecteur(data: bytes) -> PdfReader:
    try:
        r = PdfReader(BytesIO(data))
        if r.is_encrypted:
            try:
                r.decrypt("")
            except Exception:
                raise ErreurPdf("PDF protégé par mot de passe : impossible de le modifier.")
        _ = len(r.pages)
        return r
    except ErreurPdf:
        raise
    except Exception as e:  # PDF corrompu
        raise ErreurPdf(f"PDF illisible : {e}") from e


def infos_pages(data: bytes) -> list[dict]:
    """Taille (points) de chaque page telle qu'affichée."""
    r = _lecteur(data)
    out = []
    for i, page in enumerate(r.pages):
        if page.rotation:
            page.transfer_rotation_to_content()
        cb = page.cropbox
        out.append({"page": i, "largeur": float(cb.width), "hauteur": float(cb.height)})
    return out


def rendre_page_png(data: bytes, index: int, largeur_px: int = 1000) -> bytes:
    doc = pdfium.PdfDocument(data)
    try:
        if index < 0 or index >= len(doc):
            raise ErreurPdf("Page inexistante")
        page = doc[index]
        largeur_pts = page.get_width() or 595
        echelle = max(0.2, min(4.0, largeur_px / largeur_pts))
        img = page.render(scale=echelle).to_pil()
        buf = BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()
    finally:
        doc.close()


def _image_depuis_data_url(data_url: str) -> ImageReader:
    if not data_url:
        raise ErreurPdf("Image de signature manquante")
    b64 = data_url.split(",", 1)[1] if "," in data_url else data_url
    try:
        return ImageReader(BytesIO(base64.b64decode(b64)))
    except Exception as e:
        raise ErreurPdf("Image de signature invalide") from e


def _couleur(c: str | None, defaut: str = "#1a1f2e"):
    try:
        return HexColor(c or defaut)
    except Exception:
        return HexColor(defaut)


def appliquer(
    data: bytes,
    annotations: list[dict[str, Any]],
    *,
    signature_png: str | None = None,
    paraphe_png: str | None = None,
    signataire: str = "",
    reference: str = "",
    pages_supprimees: list[int] | None = None,
    rotations: dict[int, int] | None = None,
    maintenant: datetime | None = None,
) -> tuple[bytes, list[int]]:
    """Applique annotations, signature, rotations et suppressions. Retourne (pdf, pages signées)."""
    maintenant = maintenant or datetime.now(timezone.utc)
    r = _lecteur(data)
    nb = len(r.pages)
    par_page: dict[int, list[dict]] = {}
    for a in annotations:
        t = a.get("type")
        if t not in TYPES_ANNOTATION:
            raise ErreurPdf(f"Type d'annotation inconnu : {t}")
        p = int(a.get("page", 0))
        if p < 0 or p >= nb:
            raise ErreurPdf(f"Page {p + 1} inexistante")
        par_page.setdefault(p, []).append(a)

    sig_img = _image_depuis_data_url(signature_png) if any(
        a["type"] == "signature" for a in annotations) else None
    par_img = None
    if any(a["type"] == "paraphe" for a in annotations):
        par_img = _image_depuis_data_url(paraphe_png or signature_png or "")

    pages_signees: list[int] = []
    w = PdfWriter()
    for i, page in enumerate(r.pages):
        if page.rotation:
            page.transfer_rotation_to_content()
        annots = par_page.get(i, [])
        if annots:
            cb = page.cropbox
            left, bottom = float(cb.left), float(cb.bottom)
            W, H = float(cb.width), float(cb.height)
            mb = page.mediabox
            buf = BytesIO()
            c = canvas.Canvas(buf, pagesize=(float(mb.right), float(mb.top)))
            signee = False
            for a in annots:
                fx, fy = float(a.get("x", 0)), float(a.get("y", 0))
                fw, fh = float(a.get("w", 0.2)), float(a.get("h", 0.05))
                x = left + fx * W
                y_haut = bottom + (1 - fy) * H
                bw, bh = fw * W, fh * H
                y = y_haut - bh
                t = a["type"]
                if t == "masque":
                    c.setFillColorRGB(1, 1, 1)
                    c.setStrokeColorRGB(1, 1, 1)
                    c.rect(x, y, bw, bh, fill=1, stroke=0)
                elif t == "surlignage":
                    c.saveState()
                    c.setFillColorRGB(1, 0.9, 0.2)
                    c.setFillAlpha(0.35)
                    c.rect(x, y, bw, bh, fill=1, stroke=0)
                    c.restoreState()
                elif t in ("texte", "date"):
                    taille = float(a.get("taille") or 11)
                    texte = maintenant.strftime("%d/%m/%Y") if t == "date" and not a.get("texte") else str(a.get("texte", ""))
                    c.setFillColor(_couleur(a.get("couleur")))
                    c.setFont("Helvetica", taille)
                    for k, ligne in enumerate(texte.split("\n")):
                        c.drawString(x + 1, y_haut - taille * (k + 1) + 1, ligne)
                elif t == "coche":
                    taille = min(bw, bh) * 0.9 or 12
                    c.setFillColor(_couleur(a.get("couleur"), "#1f3a68"))
                    c.setFont("ZapfDingbats", taille)
                    c.drawString(x + (bw - taille * 0.8) / 2, y + (bh - taille * 0.7) / 2, "4")
                elif t in ("signature", "paraphe"):
                    img = sig_img if t == "signature" else par_img
                    c.drawImage(img, x, y, width=bw, height=bh, mask="auto", preserveAspectRatio=True, anchor="c")
                    signee = True
            if signee:
                pages_signees.append(i)
                mention = (f"Signé électroniquement par {signataire} le {maintenant.strftime('%d/%m/%Y à %H:%M')} UTC"
                           f"{' — ' + reference if reference else ''}")
                c.setFillColorRGB(0.35, 0.38, 0.47)
                c.setFont("Helvetica", 6.5)
                c.drawString(left + 18, bottom + 10, mention)
            c.save()
            buf.seek(0)
            page.merge_page(PdfReader(buf).pages[0])
        w.add_page(page)

    # Rotations puis suppressions (indices d'origine)
    for idx, angle in (rotations or {}).items():
        idx = int(idx)
        if 0 <= idx < nb and int(angle) % 90 == 0 and int(angle) % 360:
            w.pages[idx].rotate(int(angle) % 360)
    a_supprimer = sorted({int(p) for p in (pages_supprimees or []) if 0 <= int(p) < nb}, reverse=True)
    if len(a_supprimer) >= nb:
        raise ErreurPdf("Impossible de supprimer toutes les pages du document.")
    for idx in a_supprimer:
        del w.pages[idx]

    w.add_metadata({"/Producer": "Téo — porte-documents"})
    out = BytesIO()
    w.write(out)
    return out.getvalue(), pages_signees


def nb_pages(data: bytes) -> int:
    try:
        return len(_lecteur(data).pages)
    except ErreurPdf:
        return 0


def certificat(document: dict, versions: list[dict], signatures: list[dict], genere_le: datetime | None = None) -> bytes:
    """Certificat de signature : historique des versions et des signatures avec empreintes SHA-256."""
    genere_le = genere_le or datetime.now(timezone.utc)
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    y = H - 60

    def ligne(texte: str, taille: float = 9.5, gras: bool = False, couleur=(0.1, 0.12, 0.18), dy: float = 14):
        nonlocal y
        if y < 60:
            c.showPage()
            y = H - 60
        c.setFillColorRGB(*couleur)
        c.setFont("Helvetica-Bold" if gras else "Helvetica", taille)
        c.drawString(50, y, texte)
        y -= dy

    ligne("Certificat de signature électronique", 16, True, (0.12, 0.23, 0.41), 22)
    ligne("Téo — porte-documents de la SCIC Lieux Communs", 9, couleur=(0.42, 0.45, 0.56), dy=24)
    ligne(f"Document : {document['titre']} (n° {document['id']})", 11, True)
    ligne(f"Fichier : {document['nom_fichier']} — propriétaire : {document['proprietaire']}")
    ligne(f"Version courante : v{document['version_courante']}", dy=22)

    ligne("Signatures", 12, True, (0.12, 0.23, 0.41), 18)
    if not signatures:
        ligne("Aucune signature enregistrée.")
    for s in signatures:
        ligne(f"{s['nom_affichage'] or s['signataire']} ({s['signataire']}) — {s['signed_at']} UTC", 10, True)
        pages = ", ".join(str(p + 1) for p in s.get("pages") or [])
        ligne(f"   Version produite : v{s['version_numero']} — page(s) {pages or '—'} — adresse IP : {s.get('ip') or '—'}")
        ligne(f"   Empreinte SHA-256 : {s['sha256']}", 8, dy=18)

    y -= 6
    ligne("Historique des versions", 12, True, (0.12, 0.23, 0.41), 18)
    for v in versions:
        ligne(f"v{v['numero']} — {v['created_at']} UTC — {v['auteur']} — {v['commentaire'] or 'import'}", 9.5)
        ligne(f"   SHA-256 : {v['sha256']}", 8, dy=16)

    y -= 10
    for t in (
        "Signature électronique simple au sens du règlement eIDAS (UE n° 910/2014) : l'identité du signataire",
        "repose sur son compte authentifié. L'empreinte SHA-256 permet de vérifier que le fichier n'a pas été modifié",
        "depuis la signature. Pour une signature avancée ou qualifiée, recourir à un prestataire de confiance.",
        f"Certificat généré le {genere_le.strftime('%d/%m/%Y à %H:%M')} UTC.",
    ):
        ligne(t, 8, couleur=(0.42, 0.45, 0.56), dy=11)
    c.showPage()
    c.save()
    return buf.getvalue()
