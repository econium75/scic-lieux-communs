import type { OngletKey, PerimetreBRS, SimData, SimResult } from "@/lib/simulateur";

export type TabProps = {
  opId: number;
  data: SimData;
  result: SimResult;
  /** Modifie une copie de la saisie (immutabilité gérée par le parent). */
  update: (fn: (d: SimData) => void) => void;
  /** Remplace toute la saisie (ex. retour du serveur après « appliquer le barème »). */
  replace: (d: SimData) => void;
  canEdit: boolean;
  goTo: (k: OngletKey) => void;
  /** Onglets 7 et 8 : avec ou sans les logements BRS. */
  brs: PerimetreBRS;
  setBrs: (b: PerimetreBRS) => void;
};
