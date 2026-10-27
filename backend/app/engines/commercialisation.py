"""Commercialisation BRS — méthode du classeur « Simulation BRS » de la SCIC (octobre 2026).

Un ménage :
  1. composition → nombre de personnes et unités de consommation (1 + 0,5 par adulte supplémentaire ≥ 14 ans + 0,3 par enfant < 14 ans) ;
  2. éligibilité : revenu fiscal de référence N-2 ≤ plafond de ressources BRS selon le nombre de personnes ;
  3. tranche de déciles (cible de subvention) : revenu disponible par UC ≤ D4 → 3-4, ≤ D6 → 5-6, ≤ D9 → 7-9, sinon hors cible ;
  4. logement : prix de vente BRS de la typologie, subvention selon la tranche, frais d'acquisition (sur le prix),
     montant à emprunter = prix net + frais − apport ;
  5. coût mensuel : mensualité (hors assurance), assurance emprunteur (sur capital), redevance foncière, charges, taxe foncière ;
  6. solvabilité : taux d'effort bancaire (prêt + assurance + redevance + crédits en cours) / revenus nets ≤ taux maximal (HCSF),
     reste à vivre par UC ≥ minimum ;
  7. verdict : non éligible (ressources) / finançable / à retravailler.

Écart volontaire avec le classeur : quand le plafond de ressources n'est pas saisi, le classeur affiche « NON »
(la cellule vide vaut 0) ; ici le verdict est « à compléter ».

Programme : répartition des logements de chaque typologie par tranche de déciles, subventions et prix nets totaux,
quotités réelles comparées aux quotités cibles.
"""
from __future__ import annotations

import copy

TRANCHES = ("3-4", "5-6", "7-9")
LIBELLE_TRANCHE = {"3-4": "Déciles 3-4", "5-6": "Déciles 5-6", "7-9": "Déciles 7-9", "hors": "Hors cible"}
VERDICTS = {
    "financable": "Finançable",
    "a_retravailler": "À retravailler (apport, typologie, durée)",
    "non_eligible": "Non éligible (ressources)",
    "a_completer": "À compléter",
}

HYPOTHESES_DEFAUT: dict = {
    "typologies": [
        {"code": "T2", "surface": 45, "prix_ttc": 181_000, "nb": 5,
         "subventions": {"3-4": 27_100, "5-6": 14_500, "7-9": 5_500}, "repartition": {"3-4": 2, "5-6": 2, "7-9": 1}},
        {"code": "T3", "surface": 65, "prix_ttc": 271_600, "nb": 6,
         "subventions": {"3-4": 40_700, "5-6": 21_700, "7-9": 8_200}, "repartition": {"3-4": 2, "5-6": 2, "7-9": 2}},
        {"code": "T4", "surface": 80, "prix_ttc": 325_000, "nb": 4,
         "subventions": {"3-4": 48_700, "5-6": 26_000, "7-9": 9_600}, "repartition": {"3-4": 2, "5-6": 1, "7-9": 1}},
    ],
    "redevance_m2_mois": 1.5,
    "charges_m2_mois": 2.5,
    "taxe_fonciere_an": 600,
    "taux_pret": 0.035,
    "taux_assurance": 0.003,
    "duree_ans": 25,
    "frais_acquisition": 0.03,
    "taux_effort_max": 0.35,
    "reste_a_vivre_min_uc": 700,
    # Revenu fiscal de référence N-2 maximal pour 1, 2, 3, 4, 5 personnes et plus.
    "plafonds": {
        "zone": "Zones A et A bis",
        "source": "Plafonds PSLA 2026 (arrêté du 24 février 2026) — à vérifier pour le BRS et la zone de l'opération",
        "montants": [38_844, 58_057, 76_105, 90_863, 108_107],
    },
    "deciles": {
        "source": "Insee Filosofi 2021 — Saint-Denis",
        "D3": 12_610, "D4": 14_540, "D5": 16_620, "D6": 18_980, "D7": 21_920, "D8": 25_920, "D9": 32_240,
    },
    "quotites_cibles": {"3-4": 0.30, "5-6": 0.40, "7-9": 0.30},
}


def _num(v, defaut: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return defaut


def hypotheses(data: dict | None) -> dict:
    """Hypothèses complètes : valeurs saisies, complétées par les valeurs par défaut."""
    h = copy.deepcopy(HYPOTHESES_DEFAUT)
    for k, v in (data or {}).items():
        if k in ("plafonds", "deciles", "quotites_cibles") and isinstance(v, dict):
            h[k] = {**h[k], **v}
        elif v is not None:
            h[k] = v
    return h


def _pmt(taux_mensuel: float, n: int, capital: float) -> float:
    if capital <= 0 or n <= 0:
        return 0.0
    if taux_mensuel == 0:
        return capital / n
    return capital * taux_mensuel / (1 - (1 + taux_mensuel) ** -n)


def unites_consommation(adultes: int, enfants: int) -> float:
    return 1 + 0.5 * max(adultes - 1, 0) + 0.3 * enfants


def plafond_ressources(h: dict, personnes: int) -> float | None:
    montants = (h.get("plafonds") or {}).get("montants") or []
    i = min(max(personnes, 1), 5) - 1
    v = montants[i] if i < len(montants) else None
    return float(v) if v not in (None, "") and _num(v) > 0 else None


def tranche(h: dict, revenu_par_uc: float) -> str:
    d = h["deciles"]
    if revenu_par_uc <= _num(d.get("D4")):
        return "3-4"
    if revenu_par_uc <= _num(d.get("D6")):
        return "5-6"
    if revenu_par_uc <= _num(d.get("D9")):
        return "7-9"
    return "hors"


def typologie(h: dict, code: str) -> dict | None:
    return next((t for t in h["typologies"] if t.get("code") == code), None)


def simuler_menage(h: dict, m: dict) -> dict:
    """m : adultes, enfants (< 14 ans), rfr_n2, revenu_disponible_annuel, revenus_nets_mensuels,
    credits_mensuels, apport, typologie."""
    adultes = max(int(_num(m.get("adultes"), 1)), 1)
    enfants = max(int(_num(m.get("enfants"))), 0)
    rfr = _num(m.get("rfr_n2"))
    rev_dispo = _num(m.get("revenu_disponible_annuel"))
    nets = _num(m.get("revenus_nets_mensuels"))
    credits = _num(m.get("credits_mensuels"))
    apport = _num(m.get("apport"))
    motifs: list[str] = []

    personnes = adultes + enfants
    uc = unites_consommation(adultes, enfants)
    plafond = plafond_ressources(h, personnes)
    eligible = None if plafond is None else rfr <= plafond
    rev_uc = rev_dispo / uc
    tr = tranche(h, rev_uc)

    t = typologie(h, m.get("typologie") or "") or (h["typologies"][0] if h["typologies"] else
                                                     {"code": "?", "surface": 0, "prix_ttc": 0, "subventions": {}})
    surface, prix = _num(t.get("surface")), _num(t.get("prix_ttc"))
    subvention = 0.0 if tr == "hors" else _num((t.get("subventions") or {}).get(tr))
    prix_net = prix - subvention
    frais = prix * _num(h["frais_acquisition"])
    emprunt = max(prix_net + frais - apport, 0.0)

    mensualite = _pmt(_num(h["taux_pret"]) / 12, int(_num(h["duree_ans"]) * 12), emprunt)
    assurance = emprunt * _num(h["taux_assurance"]) / 12
    redevance = surface * _num(h["redevance_m2_mois"])
    charges = surface * _num(h["charges_m2_mois"])
    taxe = _num(h["taxe_fonciere_an"]) / 12
    cout = mensualite + assurance + redevance + charges + taxe

    effort = (mensualite + assurance + redevance + credits) / nets if nets > 0 else None
    effort_max = _num(h["taux_effort_max"])
    rav = nets - cout - credits
    rav_uc = rav / uc
    rav_min = _num(h["reste_a_vivre_min_uc"])

    if eligible is False:
        verdict = "non_eligible"
        motifs.append(f"Revenu fiscal de référence au-dessus du plafond pour {personnes} personne{'s' if personnes > 1 else ''}")
    elif eligible is None:
        verdict = "a_completer"
        motifs.append("Plafond de ressources à saisir dans les hypothèses : éligibilité non vérifiée")
    elif effort is None:
        verdict = "a_completer"
        motifs.append("Revenus nets mensuels à saisir pour calculer le taux d'effort")
    elif effort <= effort_max and rav_uc >= rav_min:
        verdict = "financable"
    else:
        verdict = "a_retravailler"
    if effort is not None and effort > effort_max:
        motifs.append(f"Taux d'effort {effort * 100:.1f} % au-dessus du maximum de {effort_max * 100:.0f} %")
    if nets > 0 and rav_uc < rav_min:
        motifs.append(f"Reste à vivre de {rav_uc:,.0f} € par UC et par mois, sous le minimum de {rav_min:,.0f} €".replace(",", " "))
    if tr == "hors":
        motifs.append("Revenu disponible par UC au-dessus du 9e décile : hors cible de subvention")

    etapes = [
        ("Composition", "Nombre de personnes", personnes, ""),
        ("Composition", "Unités de consommation", round(uc, 2), "UC"),
        ("Éligibilité", "Plafond de ressources applicable", plafond, "€"),
        ("Éligibilité", "Éligible au BRS", "Plafond à saisir" if eligible is None else ("OUI" if eligible else "NON"), ""),
        ("Éligibilité", "Revenu disponible par UC", round(rev_uc, 2), "€/an"),
        ("Éligibilité", "Tranche de déciles", LIBELLE_TRANCHE[tr], ""),
        ("Logement", f"Surface habitable {t.get('code')}", surface, "m²"),
        ("Logement", "Prix de vente BRS", prix, "€"),
        ("Logement", "Subvention ménage", subvention, "€"),
        ("Logement", "Prix net après subvention", prix_net, "€"),
        ("Logement", "Frais d'acquisition", round(frais, 2), "€"),
        ("Logement", "Montant à emprunter", round(emprunt, 2), "€"),
        ("Coût mensuel", "Mensualité de prêt (hors assurance)", round(mensualite, 2), "€/mois"),
        ("Coût mensuel", "Assurance emprunteur", round(assurance, 2), "€/mois"),
        ("Coût mensuel", "Redevance foncière (OFS)", round(redevance, 2), "€/mois"),
        ("Coût mensuel", "Charges de copropriété", round(charges, 2), "€/mois"),
        ("Coût mensuel", "Taxe foncière (mensualisée)", round(taxe, 2), "€/mois"),
        ("Coût mensuel", "Coût mensuel total du logement", round(cout, 2), "€/mois"),
        ("Solvabilité", "Taux d'effort bancaire", None if effort is None else round(effort, 4), "%"),
        ("Solvabilité", "Taux d'effort maximal", effort_max, "%"),
        ("Solvabilité", "Reste à vivre", round(rav, 2), "€/mois"),
        ("Solvabilité", "Reste à vivre par UC", round(rav_uc, 2), "€/mois"),
    ]
    return {
        "reference": m.get("reference") or "",
        "typologie": t.get("code"),
        "personnes": personnes, "uc": round(uc, 4),
        "plafond": plafond, "eligible": eligible,
        "revenu_par_uc": round(rev_uc, 2), "tranche": tr, "tranche_libelle": LIBELLE_TRANCHE[tr],
        "surface": surface, "prix": prix, "subvention": subvention, "prix_net": prix_net,
        "frais": round(frais, 2), "emprunt": round(emprunt, 2),
        "mensualite": round(mensualite, 2), "assurance": round(assurance, 2), "redevance": round(redevance, 2),
        "charges": round(charges, 2), "taxe_fonciere": round(taxe, 2), "cout_mensuel": round(cout, 2),
        "taux_effort": None if effort is None else round(effort, 4), "taux_effort_max": effort_max,
        "reste_a_vivre": round(rav, 2), "reste_a_vivre_uc": round(rav_uc, 2), "reste_a_vivre_min_uc": rav_min,
        "verdict": verdict, "verdict_libelle": VERDICTS[verdict], "motifs": motifs,
        "etapes": [{"section": s, "label": l, "valeur": v, "unite": u} for s, l, v, u in etapes],
    }


def programme(h: dict) -> dict:
    """Répartition des subventions par tranche de déciles (onglet « Programme & subventions »)."""
    lignes = []
    tot = {"nb": 0, "subvention": 0.0, "prix_brut": 0.0, "prix_net": 0.0, **{k: 0 for k in TRANCHES}}
    for t in h["typologies"]:
        nb = int(_num(t.get("nb")))
        rep = {k: int(_num((t.get("repartition") or {}).get(k))) for k in TRANCHES}
        ecart = sum(rep.values()) - nb
        subv = sum(rep[k] * _num((t.get("subventions") or {}).get(k)) for k in TRANCHES)
        brut = nb * _num(t.get("prix_ttc"))
        lignes.append({"code": t.get("code"), "nb": nb, "repartition": rep, "ecart": ecart,
                       "controle": "OK" if ecart == 0 else f"Écart {ecart:+d}",
                       "subvention": subv, "prix_brut": brut, "prix_net": brut - subv})
        tot["nb"] += nb
        tot["subvention"] += subv
        tot["prix_brut"] += brut
        tot["prix_net"] += brut - subv
        for k in TRANCHES:
            tot[k] += rep[k]
    reelles = {k: (tot[k] / tot["nb"] if tot["nb"] else 0.0) for k in TRANCHES}
    return {
        "lignes": lignes, "total": tot,
        "quotites_reelles": reelles, "quotites_cibles": {k: _num(h["quotites_cibles"].get(k)) for k in TRANCHES},
        "subvention_moyenne": tot["subvention"] / tot["nb"] if tot["nb"] else 0.0,
        "coherent": all(l["ecart"] == 0 for l in lignes),
    }


def couverture(h: dict, resultats: list[dict]) -> list[dict]:
    """Logements prévus par typologie et tranche, face aux candidats finançables."""
    out = []
    for t in h["typologies"]:
        for k in TRANCHES:
            prevus = int(_num((t.get("repartition") or {}).get(k)))
            candidats = [r for r in resultats if r["typologie"] == t.get("code") and r["tranche"] == k]
            out.append({"typologie": t.get("code"), "tranche": k, "prevus": prevus, "candidats": len(candidats),
                        "financables": sum(1 for r in candidats if r["verdict"] == "financable")})
    return out
