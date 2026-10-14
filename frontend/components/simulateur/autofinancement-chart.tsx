"use client";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LigneExploitation } from "@/lib/simulateur";

const k = (v: number) => `${Math.round(v / 1000).toLocaleString("fr-FR")} k€`;

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
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e6dc" />
          <XAxis dataKey="annee" tick={{ fontSize: 11, fill: "#6b7390" }} interval={4} />
          <YAxis yAxisId="a" tickFormatter={k} tick={{ fontSize: 11, fill: "#6b7390" }} width={64} />
          <YAxis yAxisId="c" orientation="right" tickFormatter={k} tick={{ fontSize: 11, fill: "#6b7390" }} width={70} />
          <Tooltip
            formatter={(v: number, name: string) => [`${v.toLocaleString("fr-FR")} €`, name]}
            labelFormatter={(l) => `Année ${l}`}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine yAxisId="a" y={0} stroke="#a8adc1" />
          <Bar yAxisId="a" dataKey="autof" name="Autofinancement net annuel" fill="#2a5aa0" />
          <Line yAxisId="c" type="monotone" dataKey="cumul" name="Cumul" stroke="#d97706" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
