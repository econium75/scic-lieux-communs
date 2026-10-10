export function KpiCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "ok" | "warn" | "danger";
}) {
  const toneClasses = {
    default: "text-ink-900",
    ok: "text-ok-500",
    warn: "text-warn-500",
    danger: "text-danger-500",
  }[tone];

  return (
    <div className="rounded-sm bg-white border border-paper-200 p-5">
      <div className="text-[10px] uppercase tracking-widest text-ink-500">{label}</div>
      <div className={`kpi-value text-3xl mt-2 ${toneClasses}`}>{value}</div>
      {sub && <div className="text-xs text-ink-500 mt-1">{sub}</div>}
    </div>
  );
}
