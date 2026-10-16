"use client";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import { espacesLisibles } from "@/lib/format";

export function SensibiliteChart({
  rows,
  paramLabel,
}: {
  rows: {
    value: number;
    marge_nette: number;
    loyer_equilibre_m2_mois: number | null;
  }[];
  paramLabel: string;
}) {
  const data = rows.map((r) => ({
    value: r.value,
    marge_nette: r.marge_nette,
    loyer_eq: r.loyer_equilibre_m2_mois,
  }));

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dae0e8" />
          <XAxis
            dataKey="value"
            tick={{ fontSize: 11, fill: "#667085" }}
            label={{ value: paramLabel, position: "bottom", fontSize: 11, fill: "#667085" }}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: "#667085" }}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            label={{ value: "Marge nette (€)", angle: -90, position: "insideLeft", fontSize: 11, fill: "#4b52d6" }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 10, fill: "#667085" }}
            label={{ value: "Loyer éq. €/m²/mois", angle: 90, position: "insideRight", fontSize: 11, fill: "#d97706" }}
          />
          <ReferenceLine yAxisId="left" y={0} stroke="#a7b0c0" strokeDasharray="2 2" />
          <ReferenceLine yAxisId="right" y={11.8} stroke="#d0342c" strokeDasharray="2 2" label={{ value: "Plafond PLS", fontSize: 9, fill: "#d0342c", position: "insideTopRight" }} />
          <Tooltip
            formatter={(v: number, name: string) => {
              if (name === "Loyer d'équilibre") return `${v.toFixed(2).replace(".", ",")} €/m²/mois`;
              return espacesLisibles(new Intl.NumberFormat("fr-FR", {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0,
              }).format(v));
            }}
            contentStyle={{ fontSize: 11 }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 20 }} />
          <Bar yAxisId="left" dataKey="marge_nette" name="Marge nette" fill="#4b52d6" opacity={0.75} />
          <Line yAxisId="right" type="monotone" dataKey="loyer_eq" name="Loyer d'équilibre" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
