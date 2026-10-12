import { api } from "@/lib/api";
import { ImportsClient } from "./client";

export default async function ImportsPage({ params }: { params: { id: string } }) {
  const opId = Number(params.id);
  let scenarios: Awaited<ReturnType<typeof api.listScenarios>> = [];
  let operation = null;
  try {
    scenarios = await api.listScenarios(opId);
    operation = await api.getOperation(opId);
  } catch {}

  return <ImportsClient opId={opId} scenarios={scenarios} operationNom={operation?.nom ?? ""} />;
}
