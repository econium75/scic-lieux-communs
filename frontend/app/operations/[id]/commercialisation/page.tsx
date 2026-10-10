import { api } from "@/lib/api";
import { CommercialisationClient } from "./client";

export default async function CommercialisationPage({ params }: { params: { id: string } }) {
  const opId = Number(params.id);
  const scenarios = await api.listScenarios(opId);
  const scenario = scenarios.find((s) => s.is_reference) || scenarios[0];
  const menages = await api.listMenages(scenario.id);

  // Précalculer les qualifications pour les ménages existants (en parallèle)
  const results = await Promise.all(
    menages.map(async (m) => {
      try {
        const q = await api.calculerQualification(m.id);
        return { menage: m, qualification: q };
      } catch {
        return { menage: m, qualification: null };
      }
    })
  );

  return <CommercialisationClient scenarioId={scenario.id} rows={results} />;
}
