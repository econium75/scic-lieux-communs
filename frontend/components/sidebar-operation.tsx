"use client";
import { OperationsSwitcher } from "@/components/operations-switcher";
import { OperationNav, useActiveOperationId } from "@/components/operation-nav";
import type { Operation } from "@/lib/types";

/** Bloc « opération active » de la barre latérale : suit l'opération ouverte dans l'URL. */
export function SidebarOperation({ operations }: { operations: Operation[] }) {
  const opId = useActiveOperationId(operations);
  return (
    <>
      <div>
        <div className="text-[11px] tracking-widest text-ink-500 uppercase font-medium mb-2">Opération active</div>
        <OperationsSwitcher activeOperationId={opId} initialOperations={operations} />
      </div>
      {opId && <OperationNav opId={opId} compact />}
    </>
  );
}
