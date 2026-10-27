"use client";
import { useEffect, useState } from "react";
import { champCourt } from "@/components/collab/modal";
import { cn } from "@/lib/format";
import { BASES, PAYEURS, type Payeur, type RegleFacturation } from "@/lib/projets";

const nombre = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", ".")) || 0;

/** Règle de facturation d'une étape : aucune, forfait ou pourcentage (des honoraires ou du CA), payeur, facture ou financement. */
export function EditeurRegle({ r, onChange, disabled }: { r: RegleFacturation; onChange: (r: RegleFacturation) => void; disabled?: boolean }) {
  const [texte, setTexte] = useState(r.mode === "forfait" ? String(r.montant) : String(Math.round(r.taux * 100000) / 1000).replace(".", ","));
  useEffect(() => {
    setTexte(r.mode === "forfait" ? String(r.montant) : String(Math.round(r.taux * 100000) / 1000).replace(".", ","));
  }, [r.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <select aria-label="Facturation" disabled={disabled} className={cn(champCourt, "w-36")} value={r.mode}
        onChange={(e) => onChange({ ...r, mode: e.target.value as RegleFacturation["mode"] })}>
        <option value="aucune">Pas de facturation</option>
        <option value="forfait">Forfait</option>
        <option value="pourcentage">Pourcentage</option>
      </select>
      {r.mode !== "aucune" && (
        <>
          <input aria-label={r.mode === "forfait" ? "Montant (€)" : "Pourcentage"} disabled={disabled} inputMode="decimal" className={cn(champCourt, "w-24 text-right")}
            value={texte} onChange={(e) => { setTexte(e.target.value); onChange(r.mode === "forfait" ? { ...r, montant: nombre(e.target.value) } : { ...r, taux: nombre(e.target.value) / 100 }); }} />
          <span className="text-ink-500">{r.mode === "forfait" ? "€" : "%"}</span>
          {r.mode === "pourcentage" && (
            <select aria-label="Base du pourcentage" disabled={disabled} className={cn(champCourt, "w-44")} value={r.base} onChange={(e) => onChange({ ...r, base: e.target.value as RegleFacturation["base"] })}>
              {Object.entries(BASES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          )}
          <select aria-label="Payeur" disabled={disabled} className={cn(champCourt, "w-44")} value={r.payeur} onChange={(e) => onChange({ ...r, payeur: e.target.value as Payeur })}>
            {Object.entries(PAYEURS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label className="inline-flex items-center gap-1 text-ink-700">
            <input type="checkbox" disabled={disabled} checked={r.nature === "financement"} onChange={(e) => onChange({ ...r, nature: e.target.checked ? "financement" : "facture" })} />
            financement reçu (pas de facture)
          </label>
        </>
      )}
    </div>
  );
}

