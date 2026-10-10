import { api } from "@/lib/api";
import { ParametresClient } from "./client";

export default async function ParamsOperationPage({ params }: { params: { id: string } }) {
  const opId = Number(params.id);
  const scenarios = await api.listScenarios(opId);
  const scenarioRef = scenarios.find((s) => s.is_reference) || scenarios[0];
  const full = await api.getScenario(scenarioRef.id);
  return <ParametresClient opId={opId} scenario={full} />;
}
