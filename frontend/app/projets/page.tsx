import { Suspense } from "react";
import { ProjetsClient } from "./client";

export default function ProjetsPage() {
  return (
    <Suspense>
      <ProjetsClient />
    </Suspense>
  );
}
