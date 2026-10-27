import { api } from "@/lib/api";
import { CommercialisationClient } from "./client";

export default async function CommercialisationPage({ params }: { params: { id: string } }) {
  const scenarios = await api.listScenarios(Number(params.id));
  const scenario = scenarios.find((s) => s.is_reference) || scenarios[0];
  return <CommercialisationClient scenarioId={scenario.id} />;
}
