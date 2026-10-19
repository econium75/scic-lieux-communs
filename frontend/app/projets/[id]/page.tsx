import { Suspense } from "react";
import { ProjetDetailClient } from "./client";

export default function ProjetPage({ params }: { params: { id: string } }) {
  return (
    <Suspense>
      <ProjetDetailClient id={Number(params.id)} />
    </Suspense>
  );
}
