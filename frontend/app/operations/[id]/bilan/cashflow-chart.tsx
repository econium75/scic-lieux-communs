"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

// Jeu de données illustratif — M3 réel prévu session 3
const data = Array.from({ length: 40 }, (_, i) => {
  const an = i + 1;
  return {
    an: `An ${an}`,
    loyer_brut: 200000 + an * 3500,
    resultat_tresorerie: 90000 - an * 1500 + (an > 15 ? (an - 15) * 2200 : 0),
    cumul_tresorerie: -50000 + an * 12000,
  };
});

export function CashflowChart() {
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
          <Line type="monotone" dataKey="loyer_brut" name="Loyer brut" stroke="#2e7d32" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="resultat_tresorerie" name="Rés. trésorerie annuel" stroke="#2a5aa0" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="cumul_tresorerie" name="Cumul trésorerie" stroke="#d97706" dot={false} strokeWidth={1.5} strokeDasharray="4 4" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
