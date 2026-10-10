import { api } from "@/lib/api";
import { SensibiliteClient } from "./client";

export default async function SensibilitePage({ params }: { params: { id: string } }) {
  const opId = Number(params.id);
  const scenarios = await api.listScenarios(opId);
  const scenarioRef = scenarios.find((s) => s.is_reference) || scenarios[0];
  const sensibiliteParams = await api.listSensibiliteParams();

  return (
    <SensibiliteClient
      opId={opId}
      scenarioId={scenarioRef.id}
      scenarioNom={scenarioRef.nom}
      sensibiliteParams={sensibiliteParams}
    />
  );
}
