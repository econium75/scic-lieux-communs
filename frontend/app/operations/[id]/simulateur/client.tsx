"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Save, RotateCcw, FileDown, Files, Lock, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { ONGLETS, exportUrl, type OngletKey, type SimData, type SimResult, type SimulationPayload } from "@/lib/simulateur";
import { cn } from "@/lib/format";
import { Btn } from "@/components/simulateur/ui";
import { TabHypotheses } from "@/components/simulateur/tab-hypotheses";
import { TabProgramme } from "@/components/simulateur/tab-programme";
import { TabPrixRevient } from "@/components/simulateur/tab-prix-revient";
import { TabFinancement } from "@/components/simulateur/tab-financement";
import { TabReservations } from "@/components/simulateur/tab-reservations";
import { TabBilanOperation } from "@/components/simulateur/tab-bilan-operation";
import { TabExploitation } from "@/components/simulateur/tab-exploitation";
import { TabSynthese } from "@/components/simulateur/tab-synthese";
import type { TabProps } from "@/components/simulateur/tab-props";

const COMPOSANTS: Record<OngletKey, (p: TabProps) => JSX.Element> = {
  hypotheses: TabHypotheses,
  programme: TabProgramme,
  "prix-revient": TabPrixRevient,
  financement: TabFinancement,
  reservations: TabReservations,
  "bilan-operation": TabBilanOperation,
  exploitation: TabExploitation,
  synthese: TabSynthese,
};

function estOnglet(k: string | null): k is OngletKey {
  return !!k && ONGLETS.some((o) => o.key === k);
}

export function SimulateurClient({ opId, initial }: { opId: number; initial: SimulationPayload }) {
  const searchParams = useSearchParams();
  const ongletUrl = searchParams.get("onglet");
  const [onglet, setOnglet] = useState<OngletKey>(estOnglet(ongletUrl) ? ongletUrl : "hypotheses");
  const [saved, setSaved] = useState<SimulationPayload>(initial);
  const [data, setData] = useState<SimData>(initial.data);
  const [result, setResult] = useState<SimResult>(initial.result);
  const [dirty, setDirty] = useState(false);
  const [calcul, setCalcul] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // undefined = pas encore lu (avant montage) : évite d'afficher « connectez-vous » au chargement
  const [role, setRole] = useState<string | null | undefined>(undefined);
  const reqId = useRef(0);

  useEffect(() => {
    const sync = () => setRole(getUser()?.role ?? null);
    sync();
    window.addEventListener("scic:auth-change", sync);
    return () => window.removeEventListener("scic:auth-change", sync);
  }, []);
  const canEdit = role === "admin" || role === "saisie";

  // Navigation par la barre latérale (lien ?onglet=…) sans perdre la saisie en cours
  useEffect(() => {
    if (estOnglet(ongletUrl)) setOnglet(ongletUrl);
  }, [ongletUrl]);

  const goTo = useCallback((k: OngletKey) => {
    setOnglet(k);
    window.history.replaceState(null, "", `?onglet=${k}`);
    window.scrollTo({ top: 0 });
  }, []);

  // Recalcul en direct (debounce) à chaque modification
  useEffect(() => {
    if (!dirty) return;
    const id = ++reqId.current;
    setCalcul(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.calculSimulation(opId, data);
        if (id === reqId.current) setResult(r);
      } catch {
        /* le prochain calcul ou la sauvegarde remontera l'erreur */
      } finally {
        if (id === reqId.current) setCalcul(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [data, dirty, opId]);

  useEffect(() => {
    const avertir = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [dirty]);

  const update = useCallback((fn: (d: SimData) => void) => {
    setData((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
    setMsg(null);
  }, []);
  const replace = useCallback((d: SimData) => {
    setData(d);
    setDirty(true);
    setMsg(null);
  }, []);

  const enregistrer = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api.saveSimulation(opId, data);
      reqId.current++;
      setSaved(r);
      setData(r.data);
      setResult(r.result);
      setDirty(false);
      setCalcul(false);
      setMsg({ tone: "ok", text: "Simulation enregistrée." });
    } catch (e) {
      const t = String(e);
      setMsg({
        tone: "err",
        text: t.includes("401") ? "Session expirée : reconnectez-vous pour enregistrer." : t.includes("403") ? "Votre profil (lecteur) ne permet pas de modifier." : t,
      });
    } finally {
      setSaving(false);
    }
  };

  const annuler = () => {
    reqId.current++;
    setData(saved.data);
    setResult(saved.result);
    setDirty(false);
    setCalcul(false);
    setMsg(null);
  };

  const courant = ONGLETS.find((o) => o.key === onglet)!;
  const Comp = COMPOSANTS[onglet];
  const alertesParOnglet = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of result.alertes) if (a.niveau !== "info") m[a.onglet] = (m[a.onglet] || 0) + 1;
    return m;
  }, [result.alertes]);
  const idx = ONGLETS.findIndex((o) => o.key === onglet);
  const suivant = ONGLETS[idx + 1];
  const majLe = saved.updated_at ? new Date(saved.updated_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "";

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-[1500px]">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-ink-500">
            Montage financier · <Link href={`/operations/${opId}`} className="hover:underline">{saved.operation.code}</Link>
          </div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-0.5 truncate">
            {data.hypotheses.nom_operation || saved.operation.nom}
          </h1>
          <p className="text-xs text-ink-500 mt-1">
            {data.hypotheses.commune || saved.operation.commune} · zones {data.hypotheses.zone_123} / {data.hypotheses.zone_abc} ·
            livraison {data.hypotheses.annee_livraison}
            {majLe && (
              <span className="ml-2 text-ink-300">
                · enregistré le {majLe}
                {saved.updated_by ? ` par ${saved.updated_by}` : ""}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {calcul && (
            <span className="text-[11px] text-ink-500 inline-flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> calcul…
            </span>
          )}
          {dirty && <span className="text-[11px] text-warn-500 font-medium">Modifications non enregistrées</span>}
          <a href={exportUrl(opId, onglet)} className="text-xs px-3 py-1.5 rounded-sm border border-paper-200 bg-white hover:bg-paper-50 inline-flex items-center gap-1.5 text-ink-700" title={dirty ? "L'export reprend la dernière version enregistrée" : undefined}>
            <FileDown size={13} /> Exporter l'onglet
          </a>
          <a href={exportUrl(opId, "complet")} className="text-xs px-3 py-1.5 rounded-sm border border-paper-200 bg-white hover:bg-paper-50 inline-flex items-center gap-1.5 text-ink-700">
            <Files size={13} /> Classeur complet
          </a>
          {canEdit && (
            <>
              {dirty && (
                <Btn onClick={annuler} variant="ghost">
                  <RotateCcw size={12} /> Annuler
                </Btn>
              )}
              <Btn onClick={enregistrer} disabled={!dirty || saving} variant="primary">
                <Save size={13} /> {saving ? "Enregistrement…" : "Enregistrer"}
              </Btn>
            </>
          )}
        </div>
      </div>

      {msg && (
        <div
          className={cn(
            "mb-4 rounded-sm border px-4 py-2 text-sm",
            msg.tone === "ok" ? "border-ok-500/40 bg-ok-50 text-ink-700" : "border-danger-500/40 bg-danger-50 text-ink-900"
          )}
        >
          {msg.text}
        </div>
      )}
      {role && !canEdit && (
        <div className="mb-4 rounded-sm border border-paper-200 bg-paper-50 px-4 py-2 text-xs text-ink-700 flex items-center gap-2">
          <Lock size={12} />
          {role === "lecture" ? "Profil lecteur : consultation et exports uniquement." : null}
        </div>
      )}
      {role === null && (
        <div className="mb-4 rounded-sm border border-paper-200 bg-paper-50 px-4 py-2 text-xs text-ink-700 flex items-center gap-2">
          <Lock size={12} /> Lecture seule —{" "}
          <Link href="/login" className="text-brand-500 hover:underline">
            connectez-vous
          </Link>{" "}
          avec un profil éditeur pour saisir.
        </div>
      )}

      {/* Onglets */}
      <nav className="mb-5 -mx-4 sm:mx-0 overflow-x-auto border-b border-paper-200" aria-label="Onglets du simulateur">
        <div className="flex min-w-max px-4 sm:px-0">
          {ONGLETS.map((o) => {
            const actif = o.key === onglet;
            const n = alertesParOnglet[o.key];
            return (
              <button
                key={o.key}
                onClick={() => goTo(o.key)}
                className={cn(
                  "px-3 py-2.5 text-sm border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap transition",
                  actif ? "border-brand-500 text-ink-900 font-medium" : "border-transparent text-ink-500 hover:text-ink-900"
                )}
              >
                <span className={cn("text-[10px] w-4 h-4 rounded-full inline-flex items-center justify-center", actif ? "bg-brand-500 text-white" : "bg-paper-200 text-ink-700")}>
                  {o.num}
                </span>
                <span className="hidden md:inline">{o.label}</span>
                <span className="md:hidden">{o.court}</span>
                {!o.editable && <Lock size={11} className="text-ink-300" aria-label="non modifiable" />}
                {n ? (
                  <span className="text-[10px] px-1 rounded-sm bg-warn-50 text-warn-500 inline-flex items-center gap-0.5">
                    <AlertTriangle size={9} />
                    {n}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      <Comp
        opId={opId}
        data={data}
        result={result}
        update={update}
        replace={replace}
        canEdit={canEdit && courant.editable}
        goTo={goTo}
      />

      {suivant && (
        <div className="flex justify-end mt-2 mb-8">
          <Btn onClick={() => goTo(suivant.key)}>
            Étape suivante : {suivant.num}. {suivant.label} <ChevronRight size={13} />
          </Btn>
        </div>
      )}
    </div>
  );
}
