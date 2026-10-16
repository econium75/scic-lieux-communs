"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, CalendarDays, Check, CheckSquare, Download, Eraser, FileBadge, FileSignature, Highlighter, MousePointer2,
  PenLine, RotateCw, Save, Send, Share2, Signature, Trash2, Type, Undo2, Upload, X,
} from "lucide-react";
import { blobUrl, collab, telecharger, tailleLisible, type Annotation, type DocDetail, type PageInfo, type Tache, type TypeAnnotation } from "@/lib/collab";
import { fmtDate, fmtDateHeure } from "@/lib/dates";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/format";
import { Bouton, Modal } from "@/components/collab/modal";
import { MaSignature } from "@/components/collab/signature-pad";
import { TacheModal } from "@/components/collab/tache-modal";
import { BadgeStatut, BadgeType } from "@/components/collab/badges";

type Outil = "selection" | TypeAnnotation;
type Annot = Annotation & { id: string };

const OUTILS: { k: Outil; l: string; icon: typeof Type; aide: string }[] = [
  { k: "selection", l: "Sélection", icon: MousePointer2, aide: "Déplacer ou redimensionner les éléments" },
  { k: "texte", l: "Texte", icon: Type, aide: "Cliquez sur la page pour écrire" },
  { k: "signature", l: "Signature", icon: Signature, aide: "Cliquez à l'endroit de la signature" },
  { k: "paraphe", l: "Paraphe", icon: PenLine, aide: "Initiales en bas de page" },
  { k: "date", l: "Date", icon: CalendarDays, aide: "Date du jour" },
  { k: "coche", l: "Coche", icon: CheckSquare, aide: "Cocher une case" },
  { k: "surlignage", l: "Surligner", icon: Highlighter, aide: "Glissez pour surligner" },
  { k: "masque", l: "Masquer", icon: Eraser, aide: "Couvrir une zone pour la corriger (ajoutez ensuite du texte)" },
];

// Taille par défaut (fraction de la largeur / hauteur de page)
const TAILLES: Record<TypeAnnotation, [number, number]> = {
  texte: [0.32, 0.03],
  signature: [0.26, 0.07],
  paraphe: [0.09, 0.04],
  date: [0.14, 0.025],
  coche: [0.03, 0.021],
  surlignage: [0.32, 0.022],
  masque: [0.32, 0.03],
};

const nid = () => Math.random().toString(36).slice(2, 9);

export function EditeurDocument({ id }: { id: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const tacheId = params.get("tache") ? Number(params.get("tache")) : null;
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [images, setImages] = useState<Record<number, string>>({});
  const [tache, setTache] = useState<Tache | null>(null);
  const [outil, setOutil] = useState<Outil>("selection");
  const [annots, setAnnots] = useState<Annot[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [supprimees, setSupprimees] = useState<number[]>([]);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [maSig, setMaSig] = useState<{ image: string; paraphe: string }>({ image: "", paraphe: "" });
  const [commentaire, setCommentaire] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"signature" | "envoi" | "version" | null>(null);
  const [connecte, setConnecte] = useState<boolean | null>(null);
  const urls = useRef<string[]>([]);

  const charger = useCallback(async () => {
    try {
      const d = await collab.document(id);
      setDoc(d);
      if (d.est_pdf) {
        const p = await collab.pages(id, d.version_courante);
        setPages(p);
        setImages({});
        for (const info of p) {
          const u = await blobUrl(`/api/documents/${id}/versions/${d.version_courante}/pages/${info.page}.png?largeur=1100`);
          urls.current.push(u);
          setImages((prev) => ({ ...prev, [info.page]: u }));
        }
      }
    } catch (e) {
      setMsg({ ok: false, t: String((e as Error).message || e) });
    }
  }, [id]);

  useEffect(() => {
    const ok = !!getUser();
    setConnecte(ok);
    if (!ok) return;
    charger();
    collab.maSignature().then((s) => setMaSig({ image: s.image, paraphe: s.paraphe })).catch(() => {});
    const liste = urls.current;
    return () => liste.forEach((u) => URL.revokeObjectURL(u));
  }, [charger]);

  useEffect(() => {
    if (tacheId && getUser()) collab.tache(tacheId).then(setTache).catch(() => setTache(null));
  }, [tacheId]);

  // Suppression clavier de l'élément sélectionné
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement;
      if (cible.tagName === "TEXTAREA" || cible.tagName === "INPUT") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selId) {
        setAnnots((a) => a.filter((x) => x.id !== selId));
        setSelId(null);
      }
      if (e.key === "Escape") { setOutil("selection"); setSelId(null); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [selId]);

  const modifie = annots.length > 0 || supprimees.length > 0 || Object.values(rotations).some((r) => r % 360);
  const signe = annots.some((a) => a.type === "signature" || a.type === "paraphe");
  const tacheSignature = tache && tache.type_tache === "signature" && tache.statut === "a_faire" && tache.destinataire === getUser()?.username ? tache : null;

  useEffect(() => {
    const avertir = (e: BeforeUnloadEvent) => {
      if (modifie) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [modifie]);

  const placer = (page: number, fx: number, fy: number) => {
    if (outil === "selection") { setSelId(null); return; }
    if ((outil === "signature" || outil === "paraphe") && !maSig.image) {
      setModal("signature");
      return;
    }
    const info = pages.find((p) => p.page === page);
    const ratio = info ? info.largeur / info.hauteur : 0.707;
    let [w, h] = TAILLES[outil];
    if (outil === "coche") h = w * ratio; // case carrée
    const a: Annot = {
      id: nid(), page, type: outil,
      x: Math.min(Math.max(0, fx - (outil === "coche" ? w / 2 : 0)), 1 - w),
      y: Math.min(Math.max(0, fy - h / 2), 1 - h),
      w, h,
      texte: outil === "texte" ? "" : undefined,
      taille: outil === "texte" ? 11 : outil === "date" ? 10 : undefined,
    };
    setAnnots((x) => [...x, a]);
    setSelId(a.id);
    setOutil("selection");
  };

  const maj = (aid: string, patch: Partial<Annot>) => setAnnots((x) => x.map((a) => (a.id === aid ? { ...a, ...patch } : a)));

  const enregistrer = async () => {
    if (!doc) return;
    const vides = annots.filter((a) => a.type === "texte" && !a.texte?.trim());
    if (vides.length) return setMsg({ ok: false, t: "Un bloc de texte est vide : complétez-le ou supprimez-le." });
    setBusy(true);
    setMsg(null);
    try {
      const r = await collab.annoter(doc.id, {
        annotations: annots.map(({ id: _id, ...a }) => a),
        pages_supprimees: supprimees,
        rotations,
        commentaire,
        tache_id: signe && tacheSignature ? tacheSignature.id : null,
        version_base: doc.version_courante,
      });
      setAnnots([]);
      setSupprimees([]);
      setRotations({});
      setCommentaire("");
      setSelId(null);
      setMsg({
        ok: true,
        t: signe
          ? `Document signé — version v${r.version} enregistrée${tacheSignature ? ", tâche clôturée et demandeur notifié" : ""}.`
          : `Modifications enregistrées dans la version v${r.version} (les versions précédentes restent disponibles).`,
      });
      if (tacheSignature) {
        setTache(await collab.tache(tacheSignature.id).catch(() => null));
        router.replace(`/documents/${doc.id}`, { scroll: false });
      }
      await charger();
    } catch (e) {
      setMsg({ ok: false, t: String((e as Error).message || e) });
    } finally {
      setBusy(false);
    }
  };

  if (connecte === false)
    return <div className="px-6 py-10 text-sm"><Link href="/login" className="text-brand-500 hover:underline">Connectez-vous</Link> pour ouvrir ce document.</div>;
  if (!doc)
    return <div className="px-6 py-10 text-sm text-ink-500">{msg ? <span className="text-danger-500">{msg.t}</span> : "Chargement du document…"}</div>;

  return (
    <div className="px-3 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-[1500px]">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <Link href="/documents" className="text-[11px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1"><ArrowLeft size={11} /> Porte-documents</Link>
          <h1 className="font-serif text-xl lg:text-2xl text-ink-900 mt-0.5 truncate">{doc.titre}</h1>
          <p className="text-xs text-ink-500">
            v{doc.version_courante} · {doc.nb_pages} page{doc.nb_pages > 1 ? "s" : ""} · {tailleLisible(doc.taille)} · {doc.proprietaire_nom}
            {doc.statut === "signe" && <span className="ml-2 text-ok-500 font-medium">Signé</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Bouton onClick={() => telecharger(`/api/documents/${doc.id}/versions/${doc.version_courante}/fichier`, doc.nom_fichier)}><Download size={13} /> Télécharger</Bouton>
          {doc.signatures.length > 0 && (
            <Bouton onClick={() => telecharger(`/api/documents/${doc.id}/certificat.pdf`, `certificat_${doc.id}.pdf`)}><FileBadge size={13} /> Certificat</Bouton>
          )}
          <Bouton onClick={() => setModal("envoi")}><Send size={13} /> Envoyer pour…</Bouton>
        </div>
      </div>

      {tacheSignature && (
        <div className="mb-3 rounded-sm border border-warn-500/40 bg-warn-50 px-4 py-3 text-sm text-ink-900 flex flex-wrap items-center gap-3">
          <FileSignature size={16} className="text-warn-500" />
          <span className="flex-1">
            <strong>{tacheSignature.emetteur_nom}</strong> vous demande de signer ce document
            {tacheSignature.echeance ? ` avant le ${fmtDate(tacheSignature.echeance)}` : ""}.
            Choisissez l'outil <strong>Signature</strong>, cliquez à l'endroit voulu, puis « Signer et terminer la tâche ».
          </span>
          <Link href={`/taches?id=${tacheSignature.id}`} className="text-xs text-brand-500 hover:underline">Voir la tâche</Link>
        </div>
      )}
      {tache && tache.statut !== "a_faire" && tacheId && (
        <div className="mb-3 rounded-sm border border-ok-500/40 bg-ok-50 px-4 py-2 text-sm">Tâche « {tache.titre} » : <BadgeStatut t={tache} /></div>
      )}
      {msg && (
        <div className={cn("mb-3 rounded-sm border px-4 py-2 text-sm flex items-center justify-between gap-3", msg.ok ? "border-ok-500/40 bg-ok-50" : "border-danger-500/40 bg-danger-50")}>
          <span>{msg.t}</span>
          <button onClick={() => setMsg(null)} aria-label="Fermer"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <div className="xl:col-span-3">
          {doc.est_pdf ? (
            <>
              {/* Barre d'outils */}
              <div className="sticky top-14 lg:top-0 z-20 mb-3 rounded-sm border border-paper-200 bg-white/95 backdrop-blur px-2 py-2 flex flex-wrap items-center gap-1">
                {OUTILS.map((o) => (
                  <button
                    key={o.k}
                    onClick={() => { setOutil(o.k); if (o.k !== "selection") setSelId(null); }}
                    title={o.aide}
                    className={cn("text-xs px-2.5 py-1.5 rounded-sm inline-flex items-center gap-1.5 border", outil === o.k ? "bg-brand-500 text-white border-brand-500" : "border-transparent text-ink-700 hover:bg-paper-100")}
                  >
                    <o.icon size={13} /> <span className="hidden sm:inline">{o.l}</span>
                  </button>
                ))}
                <span className="mx-1 h-5 w-px bg-paper-200" />
                <button onClick={() => { setAnnots([]); setSupprimees([]); setRotations({}); setSelId(null); }} disabled={!modifie} className="text-xs px-2.5 py-1.5 rounded-sm inline-flex items-center gap-1.5 text-ink-500 hover:bg-paper-100 disabled:opacity-40">
                  <Undo2 size={13} /> <span className="hidden sm:inline">Tout annuler</span>
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Commentaire de version" className="hidden md:block text-xs px-2 py-1.5 border border-paper-200 rounded-sm w-48" />
                  <Bouton onClick={enregistrer} disabled={!modifie || busy} variante={signe ? "succes" : "primaire"}>
                    {signe ? <FileSignature size={13} /> : <Save size={13} />}
                    {busy ? "Enregistrement…" : signe ? (tacheSignature ? "Signer et terminer la tâche" : "Signer et enregistrer") : "Enregistrer une version"}
                  </Bouton>
                </div>
                {outil !== "selection" && (
                  <div className="w-full text-[11px] text-brand-700 px-1 pt-1">{OUTILS.find((o) => o.k === outil)?.aide} — Échap pour annuler.</div>
                )}
              </div>

              {/* Pages */}
              <div className="space-y-5 bg-paper-100 rounded-sm p-2 sm:p-5">
                {pages.map((p) => (
                  <PageVue
                    key={p.page}
                    info={p}
                    src={images[p.page]}
                    annots={annots.filter((a) => a.page === p.page)}
                    selId={selId}
                    outil={outil}
                    maSig={maSig}
                    supprimee={supprimees.includes(p.page)}
                    rotation={rotations[p.page] || 0}
                    onPlacer={(fx, fy) => placer(p.page, fx, fy)}
                    onSel={setSelId}
                    onMaj={maj}
                    onSuppr={(aid) => { setAnnots((x) => x.filter((a) => a.id !== aid)); setSelId(null); }}
                    onTourner={() => setRotations((r) => ({ ...r, [p.page]: ((r[p.page] || 0) + 90) % 360 }))}
                    onBasculerSuppression={() => setSupprimees((s) => (s.includes(p.page) ? s.filter((x) => x !== p.page) : [...s, p.page]))}
                  />
                ))}
                {pages.length === 0 && <div className="p-10 text-center text-sm text-ink-500">Chargement des pages…</div>}
              </div>
            </>
          ) : (
            <div className="rounded-sm border border-paper-200 bg-white p-10 text-center text-sm text-ink-500">
              Aperçu et signature disponibles uniquement pour les PDF. Utilisez « Télécharger » pour ouvrir ce fichier.
            </div>
          )}
        </div>

        {/* Panneau latéral */}
        <aside className="space-y-4">
          <Panneau titre="Versions">
            <ul className="divide-y divide-paper-200">
              {doc.versions.map((v) => (
                <li key={v.id} className="px-4 py-2 text-xs flex items-start gap-2">
                  <span className={cn("font-semibold w-7", v.numero === doc.version_courante ? "text-brand-700" : "text-ink-500")}>v{v.numero}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-ink-900 truncate">{v.commentaire || "Import"}</span>
                    <span className="text-ink-500">{v.auteur} · {fmtDateHeure(v.created_at)}</span>
                  </span>
                  <button onClick={() => telecharger(`/api/documents/${doc.id}/versions/${v.numero}/fichier`, `v${v.numero}_${doc.nom_fichier}`)} className="p-1 text-ink-500 hover:text-ink-900" title="Télécharger cette version"><Download size={12} /></button>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-paper-200">
              <button onClick={() => setModal("version")} className="text-[11px] text-brand-500 hover:underline inline-flex items-center gap-1"><Upload size={11} /> Importer une nouvelle version</button>
            </div>
          </Panneau>

          <Panneau titre={`Signatures (${doc.signatures.length})`}>
            {doc.signatures.length === 0 && <div className="px-4 py-3 text-xs text-ink-500 italic">Aucune signature.</div>}
            <ul className="divide-y divide-paper-200">
              {doc.signatures.map((s) => (
                <li key={s.id} className="px-4 py-2 text-xs">
                  <div className="text-ink-900 font-medium flex items-center gap-1"><Check size={11} className="text-ok-500" /> {s.nom_affichage || s.signataire}</div>
                  <div className="text-ink-500">{fmtDateHeure(s.signed_at)} · v{s.version_numero} · p. {s.pages.map((p) => p + 1).join(", ")}</div>
                  <div className="text-[11px] text-ink-300 font-mono break-all">SHA-256 {s.sha256.slice(0, 24)}…</div>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-paper-200">
              <button onClick={() => setModal("signature")} className="text-[11px] text-brand-500 hover:underline inline-flex items-center gap-1"><PenLine size={11} /> {maSig.image ? "Modifier ma signature" : "Créer ma signature"}</button>
            </div>
          </Panneau>

          <Panneau titre={`Tâches liées (${doc.taches.length})`}>
            {doc.taches.length === 0 && <div className="px-4 py-3 text-xs text-ink-500 italic">Aucune.</div>}
            <ul className="divide-y divide-paper-200">
              {doc.taches.map((t) => (
                <li key={t.id}>
                  <Link href={`/taches?id=${t.id}`} className="block px-4 py-2 text-xs hover:bg-paper-50">
                    <div className="flex items-center gap-1.5 mb-0.5"><BadgeType type={t.type_tache} /><BadgeStatut t={t} /></div>
                    <div className="text-ink-900">{t.titre}</div>
                    <div className="text-ink-500">{t.emetteur_nom} → {t.destinataire_nom}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </Panneau>

          <Panneau titre="Accès">
            <div className="px-4 py-3 text-xs text-ink-700 space-y-1">
              <div>Propriétaire : {doc.proprietaire_nom}</div>
              <div>Partagé avec : {doc.partage_avec.length ? doc.partage_avec.join(", ") : "personne (privé)"}</div>
              {doc.peut_gerer && <Link href="/documents" className="text-brand-500 hover:underline inline-flex items-center gap-1"><Share2 size={11} /> Gérer le partage depuis le porte-documents</Link>}
            </div>
          </Panneau>
        </aside>
      </div>

      {modal === "signature" && (
        <Modal titre="Ma signature" onClose={() => setModal(null)}>
          <MaSignature onEnregistree={() => { collab.maSignature().then((s) => setMaSig({ image: s.image, paraphe: s.paraphe })); setTimeout(() => setModal(null), 700); }} />
        </Modal>
      )}
      {modal === "envoi" && (
        <TacheModal
          onClose={() => setModal(null)}
          initial={{ document_id: doc.id, type_tache: "signature", titre: `Signer : ${doc.titre}` }}
          onCree={(n) => { setMsg({ ok: true, t: `Demande envoyée à ${n} personne(s) — notification envoyée.` }); charger(); }}
        />
      )}
      {modal === "version" && <NouvelleVersion docId={doc.id} onClose={() => setModal(null)} onFait={() => { setModal(null); setMsg({ ok: true, t: "Nouvelle version importée." }); charger(); }} />}
    </div>
  );
}

function Panneau({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="rounded-sm border border-paper-200 bg-white overflow-hidden">
      <div className="px-4 py-2 text-[11px] uppercase tracking-widest text-ink-500 border-b border-paper-200">{titre}</div>
      {children}
    </section>
  );
}

function NouvelleVersion({ docId, onClose, onFait }: { docId: number; onClose: () => void; onFait: () => void }) {
  const [f, setF] = useState<File | null>(null);
  const [c, setC] = useState("Nouvelle version");
  const [err, setErr] = useState<string | null>(null);
  const envoyer = async () => {
    if (!f) return;
    try {
      await collab.nouvelleVersion(docId, f, c);
      onFait();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  };
  return (
    <Modal titre="Nouvelle version" onClose={onClose} pied={<><Bouton onClick={onClose} variante="discret">Annuler</Bouton><Bouton onClick={envoyer} disabled={!f} variante="primaire"><Upload size={13} /> Importer</Bouton></>}>
      <input type="file" accept="application/pdf,.pdf" onChange={(e) => setF(e.target.files?.[0] || null)} className="text-sm mb-3" />
      <input value={c} onChange={(e) => setC(e.target.value)} className="w-full px-2.5 py-1.5 border border-paper-200 rounded-sm text-sm" />
      <p className="text-[11px] text-ink-500 mt-2">La version actuelle est conservée dans l'historique.</p>
      {err && <p className="text-sm text-danger-500 mt-2">{err}</p>}
    </Modal>
  );
}

function PageVue({
  info, src, annots, selId, outil, maSig, supprimee, rotation, onPlacer, onSel, onMaj, onSuppr, onTourner, onBasculerSuppression,
}: {
  info: PageInfo;
  src?: string;
  annots: Annot[];
  selId: string | null;
  outil: Outil;
  maSig: { image: string; paraphe: string };
  supprimee: boolean;
  rotation: number;
  onPlacer: (fx: number, fy: number) => void;
  onSel: (id: string | null) => void;
  onMaj: (id: string, patch: Partial<Annot>) => void;
  onSuppr: (id: string) => void;
  onTourner: () => void;
  onBasculerSuppression: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [largeurPx, setLargeurPx] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLargeurPx(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const echellePt = largeurPx / info.largeur; // px par point PDF

  // Déplacement / redimensionnement à la souris ou au doigt
  const glisser = (e: React.PointerEvent, a: Annot, mode: "deplacer" | "taille") => {
    e.stopPropagation();
    e.preventDefault();
    onSel(a.id);
    const rect = ref.current!.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY;
    const depart = { ...a };
    const bouger = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / rect.width;
      const dy = (ev.clientY - y0) / rect.height;
      if (mode === "deplacer") {
        onMaj(a.id, { x: Math.min(Math.max(0, depart.x + dx), 1 - depart.w), y: Math.min(Math.max(0, depart.y + dy), 1 - depart.h) });
      } else {
        onMaj(a.id, { w: Math.min(Math.max(0.015, depart.w + dx), 1 - depart.x), h: Math.min(Math.max(0.01, depart.h + dy), 1 - depart.y) });
      }
    };
    const fin = () => {
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", fin);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", fin);
  };

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="flex items-center justify-between text-[11px] text-ink-500 mb-1 px-1">
        <span>
          Page {info.page + 1}
          {rotation ? <span className="ml-2 text-brand-700">↻ {rotation}° à l'enregistrement</span> : null}
          {supprimee && <span className="ml-2 text-danger-500 font-medium">sera supprimée</span>}
        </span>
        <span className="flex gap-1">
          <button onClick={onTourner} className="p-1 rounded-sm hover:bg-white hover:text-ink-900" title="Pivoter de 90°"><RotateCw size={13} /></button>
          <button onClick={onBasculerSuppression} className={cn("p-1 rounded-sm hover:bg-white", supprimee ? "text-danger-500" : "hover:text-danger-500")} title={supprimee ? "Conserver la page" : "Supprimer la page"}><Trash2 size={13} /></button>
        </span>
      </div>
      <div
        ref={ref}
        className={cn("relative bg-white shadow-sm select-none", supprimee && "opacity-30", outil !== "selection" ? "cursor-crosshair" : "")}
        style={{ aspectRatio: `${info.largeur} / ${info.hauteur}` }}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.fond) return;
          const r = ref.current!.getBoundingClientRect();
          onPlacer((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`Page ${info.page + 1}`} data-fond="1" draggable={false} className="absolute inset-0 w-full h-full" />
        ) : (
          <div data-fond="1" className="absolute inset-0 flex items-center justify-center text-xs text-ink-300">Chargement…</div>
        )}
        {annots.map((a) => {
          const sel = a.id === selId;
          const style = { left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, height: `${a.h * 100}%` };
          return (
            <div
              key={a.id}
              style={style}
              onPointerDown={(e) => glisser(e, a, "deplacer")}
              className={cn(
                "absolute group cursor-move",
                sel ? "outline outline-2 outline-brand-500" : "outline outline-1 outline-dashed outline-brand-500/40",
                a.type === "surlignage" && "bg-yellow-300/40",
                a.type === "masque" && "bg-white"
              )}
            >
              {a.type === "texte" && (
                <textarea
                  autoFocus={sel && !a.texte}
                  value={a.texte}
                  onChange={(e) => onMaj(a.id, { texte: e.target.value })}
                  onPointerDown={(e) => { e.stopPropagation(); onSel(a.id); }}
                  placeholder="Votre texte…"
                  className="w-full h-full resize-none bg-transparent outline-none text-ink-900 leading-tight p-0 overflow-hidden"
                  style={{ fontSize: `${(a.taille || 11) * echellePt}px`, fontFamily: "Helvetica, Arial, sans-serif" }}
                />
              )}
              {a.type === "date" && (
                <span className="block text-ink-900 whitespace-nowrap" style={{ fontSize: `${(a.taille || 10) * echellePt}px`, fontFamily: "Helvetica, Arial, sans-serif" }}>
                  {new Date().toLocaleDateString("fr-FR")}
                </span>
              )}
              {a.type === "coche" && (
                <span className="flex w-full h-full items-center justify-center text-brand-700 font-bold" style={{ fontSize: `${a.h * 0.9 * (largeurPx * info.hauteur / info.largeur)}px`, lineHeight: 1 }}>✔</span>
              )}
              {(a.type === "signature" || a.type === "paraphe") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.type === "paraphe" ? maSig.paraphe || maSig.image : maSig.image} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" />
              )}
              {sel && (
                <>
                  <button
                    onPointerDown={(e) => { e.stopPropagation(); onSuppr(a.id); }}
                    className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-danger-500 text-white flex items-center justify-center shadow"
                    title="Supprimer"
                    aria-label="Supprimer l'élément"
                  >
                    <X size={12} />
                  </button>
                  {a.type === "texte" && (
                    <div className="absolute -top-8 left-0 flex items-center gap-1 bg-white border border-paper-200 rounded-sm shadow px-1 py-0.5" onPointerDown={(e) => e.stopPropagation()}>
                      {[9, 11, 14, 18].map((t) => (
                        <button key={t} onClick={() => onMaj(a.id, { taille: t })} className={cn("text-[11px] px-1.5 rounded-sm", (a.taille || 11) === t ? "bg-brand-500 text-white" : "text-ink-700 hover:bg-paper-100")}>{t}</button>
                      ))}
                    </div>
                  )}
                  <span
                    onPointerDown={(e) => glisser(e, a, "taille")}
                    className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-brand-500 border-2 border-white rounded-sm cursor-nwse-resize"
                    title="Redimensionner"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
