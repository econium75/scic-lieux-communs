import { Suspense } from "react";
import { ProjetClient } from "./client";

export default function ProjetPage({ params }: { params: { id: string } }) {
  return (
    <Suspense>
      <ProjetClient opId={Number(params.id)} />
    </Suspense>
  );
}
