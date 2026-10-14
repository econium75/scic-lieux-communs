import { Suspense } from "react";
import { AgendaClient } from "./client";

export default function AgendaPage() {
  return (
    <Suspense>
      <AgendaClient />
    </Suspense>
  );
}
