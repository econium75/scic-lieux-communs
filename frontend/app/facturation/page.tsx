import { Suspense } from "react";
import { FacturationClient } from "./client";

export default function FacturationPage() {
  return (
    <Suspense>
      <FacturationClient />
    </Suspense>
  );
}
