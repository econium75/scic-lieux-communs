import { api } from "@/lib/api";
import { ScenariosClient } from "./client";

export default async function ScenariosPage({ params }: { params: { id: string } }) {
  const opId = Number(params.id);
  const scenarios = await api.listScenarios(opId);

  // Précalculer bilan + exploitation pour chaque scenario
  const enriched = await Promise.all(
    scenarios.map(async (s) => {
      let bilan = null;
      let exploit = null;
      try {
        bilan = await api.calculerBilan(s.id);
      } catch {}
      try {
        exploit = await api.calculerExploitation(s.id);
      } catch {}
      return { scenario: s, bilan, exploit };
    })
  );

  const sensibiliteParams = await api.listSensibiliteParams();

  return <ScenariosClient opId={opId} rows={enriched} sensibiliteParams={sensibiliteParams} />;
}
