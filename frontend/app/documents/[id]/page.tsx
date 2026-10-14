import { Suspense } from "react";
import { EditeurDocument } from "./editeur";

export default function DocumentPage({ params }: { params: { id: string } }) {
  return (
    <Suspense>
      <EditeurDocument id={Number(params.id)} />
    </Suspense>
  );
}
