import { redirect } from "next/navigation";

// Page remplacée par le simulateur 8 onglets (validé par le client le 14/10/2026)
export default function Page({ params }: { params: { id: string } }) {
  redirect(`/operations/${params.id}/simulateur?onglet=bilan-operation`);
}
