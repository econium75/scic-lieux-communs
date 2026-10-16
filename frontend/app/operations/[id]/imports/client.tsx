"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Scenario } from "@/lib/types";
import { AttachmentsPanel } from "@/components/attachments-panel";
import { ImportModal } from "@/components/import-modal";
import { Upload, FileSpreadsheet, Calendar, Paperclip, Database, ArrowRight } from "lucide-react";

export function ImportsClient({
  opId,
  scenarios,
  operationNom,
}: {
  opId: number;
  scenarios: Scenario[];
  operationNom: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<null | "menages" | "bilan" | "ics">(null);
  const [targetScenario, setTargetScenario] = useState<number>(scenarios[0]?.id ?? 0);
  const [nomScenario, setNomScenario] = useState("Scénario importé Excel");

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 max-w-5xl">
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-widest text-ink-500">Imports</div>
        <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">Importer des données</h1>
        <p className="text-sm text-ink-500 mt-1">
          Centralise tous les imports pour l'opération <strong>{operationNom}</strong> :
          ménages, bilan M2, agenda iCal, pièces jointes, référentiels globaux.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Ménages Excel */}
        <ImportCard
          icon={FileSpreadsheet}
          color="brand"
          title="Ménages (Excel)"
          description="Charger une liste de ménages candidats BRS depuis un fichier .xlsx. Colonnes : reference, typologie, nb_personnes, nb_enfants, revenu_fiscal_annuel, apport, prestations_mensuelles."
          templateUrl="/api/imports/menages/template.xlsx"
          templateLabel="Télécharger le gabarit"
          onClick={() => setModal("menages")}
        />

        {/* Bilan M2 Excel */}
        <ImportCard
          icon={Database}
          color="ok"
          title="Bilan d'opération (Excel)"
          description="Charger un fichier au format Modèle de bilan.xls du client (onglet RECAP ou BILAN). Crée automatiquement un nouveau scénario avec les 26+ postes extraits."
          onClick={() => setModal("bilan")}
        />

        {/* iCal */}
        <ImportCard
          icon={Calendar}
          color="warn"
          title="Agenda (iCalendar)"
          description="Importer un fichier .ics exporté depuis Outlook, Google Calendar ou Thunderbird. Les événements VEVENT seront ajoutés à l'agenda partagé."
          onClick={() => setModal("ics")}
        />

        {/* Pièces jointes — géré directement par le panneau en bas */}
        <ImportCard
          icon={Paperclip}
          color="danger"
          title="Pièces jointes"
          description="Attacher plans, courriers préfecture, délibérations, PV COPIL, factures (PDF/doc/img, 50 Mo max). Voir le panneau ci-dessous."
          actionLabel="Voir le panneau ↓"
          disabled
        />
      </div>

      {/* Référentiels globaux — lien externe */}
      <div className="rounded-sm border border-paper-200 bg-paper-50/60 p-5 mb-6 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-500">Référentiels globaux</div>
          <h3 className="text-sm text-ink-900 font-medium mt-0.5">Plafonds BRS/PLS, taux, FiLoSoFi…</h3>
          <p className="text-xs text-ink-500 mt-1">
            Les référentiels sont partagés entre toutes les opérations. L'import se fait depuis la page Paramètres.
          </p>
        </div>
        <button
          onClick={() => router.push("/parametres")}
          className="text-xs px-3 py-1.5 border border-brand-500 text-brand-500 rounded-sm hover:bg-brand-50 flex items-center gap-1.5"
        >
          Aller aux paramètres <ArrowRight size={11} />
        </button>
      </div>

      {/* Pièces jointes de l'opération */}
      <AttachmentsPanel parentType="operation" parentId={opId} title="Pièces jointes de l'opération" />

      {/* Modales */}
      {modal === "menages" && (
        <>
          <div className="fixed inset-0 bg-ink-900/60 z-40" onClick={() => setModal(null)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none">
            <div className="bg-white rounded-sm max-w-lg w-full p-5 pointer-events-auto">
              <h3 className="font-serif text-lg text-ink-900 mb-3">Choisir le scénario cible</h3>
              <p className="text-xs text-ink-500 mb-3">Les ménages importés seront rattachés à ce scénario.</p>
              <select
                value={targetScenario}
                onChange={(e) => setTargetScenario(Number(e.target.value))}
                className="w-full px-2 py-1.5 border border-paper-200 rounded-sm text-sm bg-white mb-4"
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>{s.nom}{s.is_reference ? " (référence)" : ""}</option>
                ))}
              </select>
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setModal(null)} className="text-xs px-3 py-1.5 border border-ink-300 text-ink-700 rounded-sm">Annuler</button>
                <button
                  onClick={() => {
                    setModal(null);
                    setTimeout(() => setModal("menages" as any), 50);
                  }}
                  className="text-xs px-3 py-1.5 bg-brand-500 text-white rounded-sm hover:bg-brand-700"
                >
                  Continuer
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <ImportModal
        open={modal === "menages"}
        onClose={() => setModal(null)}
        title={`Import ménages Excel → scénario #${targetScenario}`}
        description="Charger une liste de ménages candidats BRS. Colonnes attendues (ordre libre, détection auto) : reference, typologie, nb_personnes, nb_enfants, revenu_fiscal_annuel, apport, prestations_mensuelles."
        templateUrl="/api/imports/menages/template.xlsx"
        templateLabel="Télécharger le gabarit Excel"
        doImport={(f) => api.importMenagesExcel(targetScenario, f)}
        onSuccess={() => setTimeout(() => router.push(`/operations/${opId}/commercialisation`), 1500)}
      />

      <ImportModal
        open={modal === "bilan"}
        onClose={() => setModal(null)}
        title="Import bilan M2 depuis Excel"
        description="Charge un fichier .xls ou .xlsx au format du Modèle de bilan.xls client (onglet RECAP ou BILAN). Un nouveau scénario sera créé avec les postes extraits."
        extraFields={
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-ink-500">Nom du scénario à créer</span>
            <input
              type="text"
              value={nomScenario}
              onChange={(e) => setNomScenario(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 border border-paper-200 rounded-sm text-sm"
            />
          </label>
        }
        doImport={async (f) => {
          await api.importBilanExcel(opId, f, nomScenario);
          return { ok: true, nb_crees: 1 };
        }}
        onSuccess={() => setTimeout(() => router.push(`/operations/${opId}/scenarios`), 1500)}
      />

      <ImportModal
        open={modal === "ics"}
        onClose={() => setModal(null)}
        title="Import iCalendar (.ics)"
        description={`Importer un fichier .ics (Outlook / Google Calendar / Thunderbird). Les événements seront rattachés à l'opération ${operationNom}.`}
        acceptedExtensions=".ics"
        doImport={(f) => api.importIcs(f, opId) as Promise<{ ok: boolean; nb_crees: number }>}
        onSuccess={() => setTimeout(() => router.push("/agenda"), 1500)}
      />
    </div>
  );
}

type Tone = "brand" | "ok" | "warn" | "danger";
const TONES: Record<Tone, { bg: string; icon: string; border: string }> = {
  brand: { bg: "bg-brand-50/40", icon: "text-brand-700", border: "border-brand-500/40" },
  ok: { bg: "bg-ok-50", icon: "text-ok-500", border: "border-ok-500/40" },
  warn: { bg: "bg-warn-50", icon: "text-warn-500", border: "border-warn-500/40" },
  danger: { bg: "bg-danger-50", icon: "text-danger-500", border: "border-danger-500/40" },
};

function ImportCard({
  icon: Icon,
  color,
  title,
  description,
  templateUrl,
  templateLabel,
  actionLabel,
  disabled = false,
  onClick,
}: {
  icon: typeof Upload;
  color: Tone;
  title: string;
  description: string;
  templateUrl?: string;
  templateLabel?: string;
  actionLabel?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const t = TONES[color];
  return (
    <div className={`rounded-sm border ${t.border} ${t.bg} p-5 flex flex-col`}>
      <div className="flex items-start gap-3 mb-3">
        <Icon size={24} className={t.icon} />
        <div>
          <h3 className="font-serif text-base text-ink-900">{title}</h3>
        </div>
      </div>
      <p className="text-xs text-ink-700 leading-relaxed flex-1">{description}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        {templateUrl ? (
          <a href={templateUrl} className="text-[11px] text-ink-500 hover:text-brand-500 flex items-center gap-1">
            ⬇ {templateLabel}
          </a>
        ) : (
          <span />
        )}
        <button
          onClick={onClick}
          disabled={disabled}
          className={`text-xs px-3 py-1.5 rounded-sm flex items-center gap-1.5 ${disabled ? "bg-paper-100 text-ink-500 cursor-not-allowed" : "bg-brand-500 text-white hover:bg-brand-700"}`}
        >
          <Upload size={11} /> {actionLabel || "Importer"}
        </button>
      </div>
    </div>
  );
}
