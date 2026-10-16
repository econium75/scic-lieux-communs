/** fr-FR sépare les milliers par une espace fine, presque invisible à l'écran : on la remplace par une espace insécable. */
export function espacesLisibles(s: string): string {
  return s.replace(/ /g, " ");
}

export function formatEuro(v: number, opts: { compact?: boolean; decimals?: number } = {}): string {
  const { compact = false, decimals = 0 } = opts;
  if (compact) {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} M€`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)} k€`;
    return `${v.toFixed(decimals)} €`;
  }
  return espacesLisibles(new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(v));
}

export function formatPct(v: number, decimals = 1): string {
  return `${v.toFixed(decimals).replace(".", ",")} %`;
}

export function formatNumber(v: number, decimals = 0): string {
  return espacesLisibles(new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(v));
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
