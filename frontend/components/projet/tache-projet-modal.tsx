"use client";
import { useMemo, useState } from "react";
import { Diamond, ListChecks, Trash2 } from "lucide-react";
import { projet, numeroter, sousTaches, STATUTS, type Planning, type StatutProjet, type TacheP } from "@/lib/projet";
import { cn } from "@/lib/format";
import { Bouton, Modal, champ, etiquette } from "@/components/collab/modal";
import { UserPicker } from "@/components/collab/user-picker";

export type Brouillon = { phase_id?: number | null; parent_id?: number | null; type?: "tache" | "jalon"; debut?: string };

export function TacheProjetModal({
  planning,
  tache,
  brouillon,
  cascade,
  canEdit,
  onClose,
  onFait,
}: {
  planning: Planning;
  tache?: TacheP;
  brouillon?: Brouillon;
  cascade: boolean;
  canEdit: boolean;
  onClose: () => void;
  onFait: (msg: string) => void;
}) {
  const aujourd = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<{
    type: "tache" | "jalon";
    titre: string;
    phase_id: number | null;
    parent_id: number | null;
    debut: string;
    fin: string;
    avancement: number;
    statut: StatutProjet;
    notes: string;
  }>({
    type: tache?.type || brouillon?.type || "tache",
    titre: tache?.titre || "",
    phase_id: tache?.phase_id ?? brouillon?.phase_id ?? planning.phases[0]?.id ?? null,
    parent_id: tache?.parent_id ?? brouillon?.parent_id ?? null,
    debut: tache?.debut || brouillon?.debut || aujourd,
    fin: tache?.fin || brouillon?.debut || aujourd,
    avancement: tache?.avancement ?? 0,
    statut: (tache?.statut || "a_faire") as StatutProjet,
    notes: tache?.notes || "",
  });
  const [assignes, setAssignes] = useState<string[]>(tache?.assignes || []);
  const [deps, setDeps] = useState<number[]>(tache?.dependances || []);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const num = useMemo(() => numeroter(planning), [planning]);

  // Tâches éligibles comme prédécesseurs : toutes sauf elle-même et ses sous-tâches
  const exclues = useMemo(() => {
    const s = new Set<number>();
    if (tache) {
      s.add(tache.id);
      sousTaches(planning.taches, tache.id).forEach((x) => s.add(x.id));
    }
    return s;
  }, [planning, tache]);
  const candidats = planning.taches
    .filter((t) => !exclues.has(t.id))
    .sort((a, b) => (num.get(`t${a.id}`) || "").localeCompare(num.get(`t${b.id}`) || "", undefined, { numeric: true }));
  const parents = planning.taches.filter((t) => t.phase_id === f.phase_id && !t.parent_id && t.type === "tache" && t.id !== tache?.id);

  const enregistrer = async () => {
    setErr(null);
    if (!f.titre.trim()) return setErr("Le titre est obligatoire.");
    if (f.type === "tache" && f.fin < f.debut) return setErr("La fin doit être postérieure au début.");
    setBusy(true);
    const corps = { ...f, fin: f.type === "jalon" ? f.debut : f.fin, assignes, dependances: deps, cascade };
    try {
      if (tache) {
        const r = await projet.modifier(tache.id, corps);
        onFait(r.decalees.length ? `Enregistré — ${r.decalees.length} tâche(s) dépendante(s) décalée(s), assignés prévenus.` : "Tâche enregistrée.");
      } else {
        await projet.creer({ ...corps, operation_id: planning.operation.id });
        onFait(assignes.length ? "Tâche créée — les personnes assignées ont été notifiées." : "Tâche créée.");
      }
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const supprimer = async () => {
    if (!tache || !confirm(`Supprimer « ${tache.titre} »${sousTaches(planning.taches, tache.id).length ? " et ses sous-tâches" : ""} ?`)) return;
    try {
      await projet.supprimer(tache.id);
      onFait("Tâche supprimée.");
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  };

  const lecture = !canEdit;
  return (
    <Modal
      titre={tache ? `${num.get(`t${tache.id}`) || ""} ${tache.titre}` : f.type === "jalon" ? "Nouveau jalon" : "Nouvelle tâche"}
      onClose={onClose}
      large
      pied={
        lecture ? (
          <Bouton onClick={onClose}>Fermer</Bouton>
        ) : (
          <>
            {tache && <span className="mr-auto"><Bouton onClick={supprimer} variante="danger"><Trash2 size={13} /> Supprimer</Bouton></span>}
            <Bouton onClick={onClose} variante="discret">Annuler</Bouton>
            <Bouton onClick={enregistrer} disabled={busy} variante="primaire">{busy ? "Enregistrement…" : "Enregistrer"}</Bouton>
          </>
        )
      }
    >
      <fieldset disabled={lecture} className="space-y-4">
        <div className="flex gap-2">
          {(
            [
              ["tache", "Tâche", ListChecks],
              ["jalon", "Jalon", Diamond],
            ] as const
          ).map(([k, l, I]) => (
            <button key={k} type="button" onClick={() => setF({ ...f, type: k })} className={cn("px-3 py-1.5 rounded-sm border text-sm inline-flex items-center gap-1.5", f.type === k ? "border-brand-500 bg-brand-50 text-brand-700" : "border-paper-200 text-ink-700")}>
              <I size={13} /> {l}
            </button>
          ))}
        </div>
        <div>
          <label className={etiquette}>Intitulé</label>
          <input className={champ} value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} placeholder="ex. Dépôt du permis de construire" autoFocus={!tache} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={etiquette}>Phase</label>
            <select className={champ} value={f.phase_id ?? ""} onChange={(e) => setF({ ...f, phase_id: e.target.value ? Number(e.target.value) : null, parent_id: null })}>
              {planning.phases.map((p) => <option key={p.id} value={p.id}>{num.get(`p${p.id}`)}. {p.nom}</option>)}
              <option value="">Sans phase</option>
            </select>
          </div>
          <div>
            <label className={etiquette}>Sous-tâche de (facultatif)</label>
            <select className={champ} value={f.parent_id ?? ""} onChange={(e) => setF({ ...f, parent_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— tâche principale —</option>
              {parents.map((t) => <option key={t.id} value={t.id}>{num.get(`t${t.id}`)} {t.titre}</option>)}
            </select>
          </div>
          <div>
            <label className={etiquette}>{f.type === "jalon" ? "Date du jalon" : "Début"}</label>
            <input type="date" className={champ} value={f.debut} onChange={(e) => setF({ ...f, debut: e.target.value, fin: f.fin < e.target.value ? e.target.value : f.fin })} />
          </div>
          {f.type === "tache" && (
            <div>
              <label className={etiquette}>Fin</label>
              <input type="date" className={champ} value={f.fin} min={f.debut} onChange={(e) => setF({ ...f, fin: e.target.value })} />
            </div>
          )}
          <div>
            <label className={etiquette}>Statut</label>
            <select className={champ} value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value as StatutProjet, avancement: e.target.value === "termine" ? 100 : f.avancement })}>
              {Object.entries(STATUTS).map(([k, s]) => <option key={k} value={k}>{s.l}</option>)}
            </select>
          </div>
          {f.type === "tache" && (
            <div>
              <label className={etiquette}>Avancement : {f.avancement} %</label>
              <input type="range" min={0} max={100} step={5} value={f.avancement} onChange={(e) => setF({ ...f, avancement: Number(e.target.value) })} className="w-full accent-brand-500" />
            </div>
          )}
        </div>
        <div>
          <label className={etiquette}>Assigné(s) — notifiés à l'attribution et en cas de changement de dates</label>
          {lecture ? <div className="text-sm">{assignes.join(", ") || "—"}</div> : <UserPicker value={assignes} onChange={setAssignes} exclureMoi={false} hauteur="max-h-32" />}
        </div>
        <div>
          <label className={etiquette}>Prédécesseurs — la tâche commence après leur fin</label>
          <div className="border border-paper-200 rounded-sm max-h-36 overflow-y-auto">
            {candidats.length === 0 && <div className="px-3 py-2 text-xs text-ink-500 italic">Aucune autre tâche.</div>}
            {candidats.map((t) => (
              <label key={t.id} className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-paper-50 cursor-pointer">
                <input type="checkbox" checked={deps.includes(t.id)} onChange={(e) => setDeps(e.target.checked ? [...deps, t.id] : deps.filter((d) => d !== t.id))} />
                <span className="text-[11px] text-ink-500 w-10">{num.get(`t${t.id}`)}</span>
                <span className="truncate">{t.type === "jalon" ? "◆ " : ""}{t.titre}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className={etiquette}>Notes</label>
          <textarea className={cn(champ, "h-16")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>
      </fieldset>
      {err && <div className="mt-3 rounded-sm border border-danger-500/30 bg-danger-50 px-3 py-2 text-sm">{err}</div>}
    </Modal>
  );
}
