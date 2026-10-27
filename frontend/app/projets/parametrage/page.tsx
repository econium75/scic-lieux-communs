"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Plus, Save, Trash2, X } from "lucide-react";
import { Bouton, champ, champCourt, etiquette } from "@/components/collab/modal";
import { getToken, getUser } from "@/lib/auth";
import { cn } from "@/lib/format";
import { EditeurRegle } from "@/components/regle-facturation";
import { REGLE_VIDE, projets, type Champ, type EtapeParcours, type Identite, type Modele, type Parcours } from "@/lib/projets";

type Onglet = "parcours" | "modeles" | "identite";

export default function ParametragePage() {
  const [onglet, setOnglet] = useState<Onglet>("parcours");
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => setRole(getUser()?.role ?? null), []);
  // stable : les éditeurs rechargent leurs données quand cette fonction change
  const dire = useCallback((ok: boolean, t: string) => setMsg({ ok, t }), []);

  if (role === undefined) return null;
  if (role !== "admin")
    return <div className="px-6 py-10 text-sm text-ink-700">Cette page est réservée aux administrateurs.</div>;

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 max-w-6xl">
      <Link href="/projets" className="text-[11px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1"><ArrowLeft size={11} /> Suivi des projets</Link>
      <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">Parcours, modèles et facturation</h1>
      <p className="text-sm text-ink-500 mt-1 mb-5">Le parcours type s'applique aux nouveaux projets ; les projets existants gardent leurs étapes.</p>

      <div className="inline-flex rounded-sm border border-paper-200 bg-white overflow-hidden mb-5">
        {([["parcours", "Parcours type"], ["modeles", "Modèles de documents"], ["identite", "Identité et facturation"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setOnglet(k); setMsg(null); }} className={cn("px-4 py-1.5 text-sm", onglet === k ? "bg-brand-500 text-white" : "text-ink-700 hover:bg-paper-50")}>{l}</button>
        ))}
      </div>

      {msg && (
        <div className={cn("mb-4 rounded-sm border px-4 py-2 text-sm flex items-center justify-between gap-3", msg.ok ? "border-ok-500/40 bg-ok-50" : "border-danger-500/40 bg-danger-50")}>
          <span>{msg.t}</span>
          <button onClick={() => setMsg(null)} aria-label="Fermer"><X size={14} /></button>
        </div>
      )}

      {onglet === "parcours" && <EditeurParcours dire={dire} />}
      {onglet === "modeles" && <EditeurModeles dire={dire} />}
      {onglet === "identite" && <EditeurIdentite dire={dire} />}
    </div>
  );
}

type Dire = (ok: boolean, t: string) => void;

function EditeurParcours({ dire }: { dire: Dire }) {
  const [p, setP] = useState<Parcours | null>(null);
  const [modeles, setModeles] = useState<Modele[]>([]);
  useEffect(() => {
    projets.parcours().then(setP).catch((e) => dire(false, String(e.message || e)));
    projets.modeles().then((r) => setModeles(r.modeles)).catch(() => {});
  }, [dire]);
  if (!p) return <div className="text-sm text-ink-500">Chargement…</div>;
  const etapes = p.etapes.map((e) => ({ ...e, phase: e.phase || "", facturation: e.facturation || { ...REGLE_VIDE } }));
  const honoraires = etapes.reduce((a, e) => a + (e.facturation.mode === "pourcentage" && e.facturation.base === "honoraires" && e.facturation.nature === "facture" ? e.facturation.taux : 0), 0);
  const phases = Array.from(new Set(etapes.map((e) => e.phase).filter(Boolean)));
  const maj = (i: number, patch: Partial<EtapeParcours>) => setP({ ...p, etapes: etapes.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const deplacer = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= etapes.length) return;
    const x = [...etapes];
    [x[i], x[j]] = [x[j], x[i]];
    setP({ ...p, etapes: x });
  };
  const enregistrer = async () => {
    try {
      setP(await projets.enregistrerParcours({ ...p, etapes, provisoire: false }));
      dire(true, "Parcours type enregistré : il s'appliquera aux prochains projets.");
    } catch (e) {
      dire(false, String((e as Error).message || e));
    }
  };
  return (
    <div className="rounded-sm border border-paper-200 bg-white">
      {p.provisoire && (
        <div className="px-5 py-3 border-b border-warn-500/30 bg-warn-50 text-sm text-ink-700">
          Parcours provisoire : remplacez-le par les étapes définies par la SCIC, puis enregistrez.
        </div>
      )}
      <ol>
        {etapes.map((e, i) => (
          <li key={i}>
            {(i === 0 || etapes[i - 1].phase !== e.phase) && e.phase && (
              <div className="px-5 py-2 bg-paper-50 border-t border-paper-200 text-[11px] uppercase tracking-widest text-ink-700 font-medium">
                Phase {phases.indexOf(e.phase) + 1} · {e.phase}
              </div>
            )}
            <div className="px-5 py-3 space-y-2 border-t border-paper-200">
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-500 w-5">{i + 1}.</span>
                <input aria-label="Nom de l'étape" className={cn(champ, "flex-1 min-w-0")} value={e.nom} onChange={(x) => maj(i, { nom: x.target.value })} />
                <input aria-label="Phase" list="phases-parcours" className={cn(champCourt, "w-56 shrink-0")} value={e.phase} onChange={(x) => maj(i, { phase: x.target.value })} />
                <button onClick={() => deplacer(i, -1)} className="p-1 text-ink-500 hover:text-ink-900" aria-label="Monter"><ArrowUp size={14} /></button>
                <button onClick={() => deplacer(i, 1)} className="p-1 text-ink-500 hover:text-ink-900" aria-label="Descendre"><ArrowDown size={14} /></button>
                <button onClick={() => setP({ ...p, etapes: etapes.filter((_, j) => j !== i) })} className="p-1 text-ink-500 hover:text-danger-500" aria-label="Supprimer l'étape"><Trash2 size={14} /></button>
              </div>
              <input aria-label="Description" placeholder="Description (facultatif)" className={cn(champ, "ml-7 w-[calc(100%-1.75rem)]")} value={e.description || ""} onChange={(x) => maj(i, { description: x.target.value })} />
              <div className="ml-7"><EditeurRegle r={e.facturation} onChange={(r) => maj(i, { facturation: r })} /></div>
              <div className="ml-7 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700">
                <span className="text-ink-500">Documents à générer :</span>
                {modeles.map((m) => (
                  <label key={m.id} className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={e.modeles.includes(m.titre)}
                      onChange={(x) => maj(i, { modeles: x.target.checked ? [...e.modeles, m.titre] : e.modeles.filter((t) => t !== m.titre) })} />
                    {m.titre}
                  </label>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <datalist id="phases-parcours">{phases.map((x) => <option key={x} value={x} />)}</datalist>
      <div className="px-5 py-3 border-t border-paper-200 flex flex-wrap items-center gap-3">
        <Bouton onClick={() => setP({ ...p, etapes: [...etapes, { phase: etapes[etapes.length - 1]?.phase || "", nom: "Nouvelle étape", description: "", facturation: { ...REGLE_VIDE }, modeles: [] }] })}>
          <Plus size={12} /> Ajouter une étape
        </Bouton>
        <span className={cn("text-xs tabular-nums", Math.abs(honoraires - 1) > 0.0001 ? "text-warn-500" : "text-ok-500")}>
          Honoraires échelonnés : {String(Math.round(honoraires * 10000) / 100).replace(".", ",")} % du contrat
        </span>
        <span className="ml-auto"><Bouton onClick={enregistrer} variante="primaire"><Save size={12} /> Enregistrer le parcours</Bouton></span>
      </div>
    </div>
  );
}

function EditeurModeles({ dire }: { dire: Dire }) {
  const [modeles, setModeles] = useState<Modele[]>([]);
  const [champs, setChamps] = useState<Champ[]>([]);
  const [sel, setSel] = useState<Modele | null>(null);
  const zone = useRef<HTMLTextAreaElement>(null);

  const charger = (garder?: number) =>
    projets.modeles().then((r) => {
      setModeles(r.modeles);
      setChamps(r.champs);
      setSel(r.modeles.find((m) => m.id === garder) || r.modeles[0] || null);
    });
  useEffect(() => {
    charger().catch((e) => dire(false, String(e.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inserer = (cle: string) => {
    if (!sel) return;
    const t = zone.current;
    const ajout = cle === "echeancier" || cle.startsWith("signatures") ? `\n{{${cle}}}\n` : `{{${cle}}}`;
    const pos = t ? t.selectionStart : sel.contenu.length;
    const contenu = sel.contenu.slice(0, pos) + ajout + sel.contenu.slice(pos);
    setSel({ ...sel, contenu });
    requestAnimationFrame(() => {
      t?.focus();
      t?.setSelectionRange(pos + ajout.length, pos + ajout.length);
    });
  };

  const enregistrer = async () => {
    if (!sel) return;
    try {
      const m = await projets.modifierModele(sel.id, { titre: sel.titre, categorie: sel.categorie, contenu: sel.contenu, actif: sel.actif });
      await charger(m.id);
      dire(true, `Modèle « ${m.titre} » enregistré.`);
    } catch (e) {
      dire(false, String((e as Error).message || e));
    }
  };
  const nouveau = async () => {
    try {
      const m = await projets.creerModele({ titre: "Nouveau modèle", categorie: "contrat", contenu: "# Titre du document\n\nTexte avec des champs comme {{client.nom}}.\n\n{{signatures}}\n" });
      await charger(m.id);
    } catch (e) {
      dire(false, String((e as Error).message || e));
    }
  };
  const supprimer = async () => {
    if (!sel) return;
    try {
      await projets.supprimerModele(sel.id);
      await charger();
      dire(true, "Modèle supprimé.");
    } catch (e) {
      dire(false, String((e as Error).message || e));
    }
  };
  const apercu = async () => {
    if (!sel) return;
    const fenetre = window.open("", "_blank");
    try {
      const r = await fetch("/api/projets/modeles/apercu", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ contenu: sel.contenu, titre: sel.titre }),
      });
      if (!r.ok) throw new Error(`Aperçu impossible (${r.status})`);
      const url = URL.createObjectURL(await r.blob());
      if (fenetre) fenetre.location.href = url;
      else window.location.href = url;
    } catch (e) {
      fenetre?.close();
      dire(false, String((e as Error).message || e));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      <div className="rounded-sm border border-paper-200 bg-white self-start">
        <ul>
          {modeles.map((m) => (
            <li key={m.id}>
              <button onClick={() => setSel(m)} className={cn("w-full text-left px-4 py-2.5 border-b border-paper-200 text-sm hover:bg-paper-50", sel?.id === m.id && "bg-brand-50 text-brand-700 font-medium")}>
                {m.titre}
                <div className="text-[11px] text-ink-500 font-normal">{m.categorie}{!m.actif && " · désactivé"}</div>
              </button>
            </li>
          ))}
        </ul>
        <div className="p-3"><Bouton onClick={nouveau}><Plus size={12} /> Nouveau modèle</Bouton></div>
      </div>

      {sel ? (
        <div className="lg:col-span-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2"><label className={etiquette} htmlFor="md-titre">Titre</label><input id="md-titre" className={champ} value={sel.titre} onChange={(e) => setSel({ ...sel, titre: e.target.value })} /></div>
            <div>
              <label className={etiquette} htmlFor="md-cat">Catégorie</label>
              <select id="md-cat" className={champ} value={sel.categorie} onChange={(e) => setSel({ ...sel, categorie: e.target.value })}>
                <option value="convention">Convention</option><option value="contrat">Contrat</option><option value="avenant">Avenant</option><option value="autre">Autre</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2">
              <label className={etiquette} htmlFor="md-contenu">Texte du modèle</label>
              <textarea id="md-contenu" ref={zone} className={cn(champ, "font-mono text-xs leading-relaxed")} rows={26} value={sel.contenu}
                onChange={(e) => setSel({ ...sel, contenu: e.target.value })} spellCheck />
              <p className="text-[11px] text-ink-500 mt-1">
                Mise en forme : <code># Titre</code>, <code>## Article</code>, <code>- puce</code>, <code>**gras**</code>, ligne vide entre deux paragraphes.
                Les textes entre crochets restent surlignés pour être complétés.
              </p>
            </div>
            <div>
              <div className={etiquette}>Champs disponibles (cliquer pour insérer)</div>
              <ul className="rounded-sm border border-paper-200 bg-white max-h-[520px] overflow-y-auto">
                {champs.map((c) => (
                  <li key={c.cle}>
                    <button onClick={() => inserer(c.cle)} className="w-full text-left px-3 py-1.5 border-b border-paper-200 hover:bg-paper-50">
                      <code className="text-[11px] text-brand-700">{`{{${c.cle}}}`}</code>
                      <div className="text-[11px] text-ink-500">{c.libelle}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-ink-700 inline-flex items-center gap-1.5 mr-auto">
              <input type="checkbox" checked={sel.actif} onChange={(e) => setSel({ ...sel, actif: e.target.checked })} /> Modèle disponible pour les projets
            </label>
            <Bouton onClick={supprimer} variante="danger"><Trash2 size={12} /> Supprimer</Bouton>
            <Bouton onClick={apercu}><Eye size={12} /> Aperçu PDF</Bouton>
            <Bouton onClick={enregistrer} variante="primaire"><Save size={12} /> Enregistrer</Bouton>
          </div>
        </div>
      ) : (
        <div className="lg:col-span-3 text-sm text-ink-500">Aucun modèle.</div>
      )}
    </div>
  );
}

const CHAMPS_IDENTITE: [string, string, string?][] = [
  ["raison_sociale", "Raison sociale"], ["forme", "Forme juridique et capital"], ["adresse", "Adresse du siège"], ["siret", "SIRET"],
  ["rcs", "RCS"], ["tva_intracom", "N° de TVA intracommunautaire"], ["representant", "Représentant (nom, fonction)"], ["email", "E-mail"],
  ["telephone", "Téléphone"], ["iban", "IBAN"], ["bic", "BIC"], ["delai_paiement_jours", "Délai de paiement (jours)"],
  ["prefixe_facture", "Préfixe des factures"], ["prefixe_avoir", "Préfixe des avoirs"],
  ["mention_tva", "Mention TVA particulière (exonération…)", "long"], ["conditions", "Conditions de paiement et pénalités", "long"],
];

function EditeurIdentite({ dire }: { dire: Dire }) {
  const [i, setI] = useState<Identite | null>(null);
  useEffect(() => {
    projets.identite().then(setI).catch((e) => dire(false, String(e.message || e)));
  }, [dire]);
  if (!i) return <div className="text-sm text-ink-500">Chargement…</div>;
  const enregistrer = async () => {
    try {
      setI(await projets.enregistrerIdentite(i));
      dire(true, "Identité et conditions de facturation enregistrées.");
    } catch (e) {
      dire(false, String((e as Error).message || e));
    }
  };
  return (
    <div className="rounded-sm border border-paper-200 bg-white p-5">
      <p className="text-sm text-ink-500 mb-4">Ces informations figurent sur les contrats, les conventions et les factures. Les champs entre crochets restent à compléter.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CHAMPS_IDENTITE.map(([k, l, long]) => (
          <div key={k} className={long ? "sm:col-span-2" : ""}>
            <label className={etiquette} htmlFor={`id-${k}`}>{l}</label>
            {long ? (
              <textarea id={`id-${k}`} className={champ} rows={3} value={String(i[k] ?? "")} onChange={(e) => setI({ ...i, [k]: e.target.value })} />
            ) : (
              <input id={`id-${k}`} className={cn(champ, String(i[k] ?? "").startsWith("[") && "bg-warn-50")} value={String(i[k] ?? "")} onChange={(e) => setI({ ...i, [k]: e.target.value })} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-5 text-right"><Bouton onClick={enregistrer} variante="primaire"><Save size={12} /> Enregistrer</Bouton></div>
    </div>
  );
}
