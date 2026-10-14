// Les dates renvoyées par l'API sont en UTC sans suffixe de fuseau (SQLite) : on les relit comme UTC.
export function parseUtc(s: string | null | undefined): Date | null {
  if (!s) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(s: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "short" }): string {
  const d = s instanceof Date ? s : parseUtc(s);
  return d ? d.toLocaleString("fr-FR", opts) : "—";
}

export function fmtDateHeure(s: string | Date | null | undefined): string {
  return fmtDate(s, { dateStyle: "short", timeStyle: "short" });
}

/** Clé AAAA-MM-JJ dans le fuseau local. */
export function cleJour(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Valeur pour <input type="datetime-local"> à partir d'une date. */
export function versInputLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${cleJour(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function joursRestants(s: string | null | undefined): number | null {
  const d = parseUtc(s);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}
