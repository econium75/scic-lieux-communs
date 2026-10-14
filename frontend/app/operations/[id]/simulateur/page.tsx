import { Suspense } from "react";
import { api } from "@/lib/api";
import { SimulateurClient } from "./client";

export default async function SimulateurPage({ params }: { params: { id: string } }) {
  const opId = Number(params.id);
  const initial = await api.getSimulation(opId);
  return (
    <Suspense>
      <SimulateurClient opId={opId} initial={initial} />
    </Suspense>
  );
}
