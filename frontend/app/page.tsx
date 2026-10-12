import { redirect } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default async function Home() {
  let ops: Awaited<ReturnType<typeof api.listOperations>> = [];
  try {
    ops = await api.listOperations();
  } catch {
    // backend offline
  }
  if (ops.length > 0) redirect(`/operations/${ops[0].id}`);
  return (
    <div className="p-10">
      <h1 className="font-serif text-2xl lg:text-3xl text-ink-900">SCIC Lieux Communs — Simulateur</h1>
      <p className="text-ink-700 mt-3">
        Backend injoignable. Démarre-le avec :{" "}
        <code className="text-xs bg-paper-100 px-2 py-1 rounded">uvicorn app.main:app --reload</code>{" "}
        depuis le dossier <code className="text-xs bg-paper-100 px-2 py-1 rounded">backend/</code>.
      </p>
      <Link href="/parametres" className="text-brand-500 underline mt-4 inline-block">
        Voir les paramètres →
      </Link>
    </div>
  );
}
