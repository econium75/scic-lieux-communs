"use client";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LigneExploitation } from "@/lib/simulateur";
import { espacesLisibles } from "@/lib/format";

const k = (v: number) => `${espacesLisibles(Math.round(v / 1000).toLocaleString("fr-FR"))} k€`;

export function AutofinancementChart({ lignes, height = 280 }: { lignes: LigneExploitation[]; height?: number }) {
  const rows = lignes.map((l) => ({
    annee: l.annee_civile,
    autof: Math.round(l.autofinancement_net),
    cumul: Math.round(l.cumul),
  }));
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dae0e8" />
          <XAxis dataKey="annee" tick={{ fontSize: 11, fill: "#667085" }} interval={4} />
          <YAxis yAxisId="a" tickFormatter={k} tick={{ fontSize: 11, fill: "#667085" }} width={64} />
          <YAxis yAxisId="c" orientation="right" tickFormatter={k} tick={{ fontSize: 11, fill: "#667085" }} width={70} />
          <Tooltip
            formatter={(v: number, name: string) => [`${espacesLisibles(v.toLocaleString("fr-FR"))} €`, name]}
            labelFormatter={(l) => `Année ${l}`}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine yAxisId="a" y={0} stroke="#a7b0c0" />
          <Bar yAxisId="a" dataKey="autof" name="Autofinancement net annuel" fill="#4b52d6" />
          <Line yAxisId="c" type="monotone" dataKey="cumul" name="Cumul" stroke="#d97706" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
