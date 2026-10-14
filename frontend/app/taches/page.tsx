import { Suspense } from "react";
import { TachesClient } from "./client";

export default function TachesPage() {
  return (
    <Suspense>
      <TachesClient />
    </Suspense>
  );
}
