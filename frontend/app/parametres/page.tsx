import { api } from "@/lib/api";
import { ReferentielsClient } from "./client";

export default async function ParametresPage() {
  let refs: Awaited<ReturnType<typeof api.listReferentiels>> = [];
  try {
    refs = await api.listReferentiels();
  } catch {}
  return <ReferentielsClient initial={refs} />;
}
