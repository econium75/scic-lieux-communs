"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import type { AnneeExploitation } from "@/lib/types";

export function CashflowChart({ annees }: { annees?: AnneeExploitation[] }) {
  // Si l'exploitation M3 n'est pas calculable, on affiche un placeholder
  if (!annees || annees.length === 0) {
    return (
      <div className="h-[240px] rounded-sm border border-dashed border-paper-200 bg-paper-50/50 flex items-center justify-center text-xs text-ink-500 italic">
        Exploitation locative non calculable — édite les hypothèses M3.
      </div>
    );
  }

  const data = annees.map((a) => ({
    an: `An ${a.annee_num}`,
    loyer: a.loyers_nets,
    resultat: a.resultat_tresorerie,
    cumul: a.cumul_tresorerie,
  }));

  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e6dc" />
          <XAxis dataKey="an" tick={{ fontSize: 10, fill: "#6b7390" }} interval={3} />
          <YAxis
            tick={{ fontSize: 10, fill: "#6b7390" }}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
          />
          <ReferenceLine y={0} stroke="#a8adc1" strokeDasharray="2 2" />
          <Tooltip
            formatter={(v: number) =>
              new Intl.NumberFormat("fr-FR", {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0,
              }).format(v)
            }
            contentStyle={{ fontSize: 11 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="loyer" name="Loyers nets" stroke="#2e7d32" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="resultat" name="Résultat trésorerie annuel" stroke="#2a5aa0" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="cumul" name="Cumul trésorerie" stroke="#d97706" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
