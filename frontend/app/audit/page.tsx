import { api } from "@/lib/api";
import { AuditClient } from "./client";

export default async function AuditPage() {
  let data: Awaited<ReturnType<typeof api.listAudit>> | null = null;
  let actions: string[] = [];
  try {
    data = await api.listAudit({ limit: 100 });
    actions = (await api.listAuditActions()).actions;
  } catch {}
  return <AuditClient initial={data} actions={actions} />;
}
