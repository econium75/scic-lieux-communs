"use client";
import { useState, useEffect, useTransition } from "react";
import { api } from "@/lib/api";
import { Calendar, Plus, Trash2, Upload } from "lucide-react";
import { ImportModal } from "@/components/import-modal";

type E = { id: number; titre: string; description: string; debut: string; fin: string | null; toute_journee: boolean; type_event: string; organisateur: string; participants: string[]; lieu: string };

const TYPE_COLORS: Record<string, string> = {
  copil: "bg-brand-50 text-brand-700 border-brand-500/40",
  coproj: "bg-ok-50 text-ok-500 border-ok-500/40",
  jalon: "bg-warn-50 text-warn-500 border-warn-500/40",
  rdv: "bg-paper-100 text-ink-700 border-paper-200",
  deadline: "bg-danger-50 text-danger-500 border-danger-500/40",
  autre: "bg-paper-100 text-ink-500 border-paper-200",
};

export default function AgendaPage() {
  const [events, setEvents] = useState<E[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({ titre: "", description: "", debut: "", fin: "", type_event: "rdv", lieu: "", participants: "" });
  const [, start] = useTransition();

  const reload = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const debut = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const fin = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();
      const r = await api.listEvents(debut, fin);
      setEvents(r);
    } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const create = () => {
    start(async () => {
      try {
        await api.createEvent({
          ...form,
          debut: new Date(form.debut).toISOString(),
          fin: form.fin ? new Date(form.fin).toISOString() : null,
          participants: form.participants.split(",").map((s) => s.trim()).filter(Boolean),
        });
        setCreating(false);
        setForm({ titre: "", description: "", debut: "", fin: "", type_event: "rdv", lieu: "", participants: "" });
        await reload();
      } catch (e) { alert(e); }
    });
  };
  const remove = (id: number) => {
    if (!confirm("Supprimer cet événement ?")) return;
    start(async () => { await api.deleteEvent(id); await reload(); });
  };

  // Grouper par jour
  const byDay: Record<string, E[]> = {};
  for (const e of events) {
    const key = new Date(e.debut).toISOString().split("T")[0];
    (byDay[key] ||= []).push(e);
  }
  const days = Object.keys(byDay).sort();

  return (
    <div className="px-10 py-8 max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-500 flex items-center gap-2">
            <Calendar size={11} /> Agenda partagé
          </div>
          <h1 className="font-serif text-3xl text-ink-900 mt-1">Calendrier équipe</h1>
          <p className="text-sm text-ink-500 mt-1">COPIL, COPROJ, jalons, rendez-vous et deadlines — partagés entre tous les utilisateurs.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setImportOpen(true)} className="text-xs px-4 py-2 border border-brand-500 text-brand-500 rounded-sm hover:bg-brand-50 flex items-center gap-2">
            <Upload size={13} /> Import iCal
          </button>
          <button onClick={() => setCreating(!creating)} className="text-xs px-4 py-2 bg-brand-500 text-white rounded-sm hover:bg-brand-700 flex items-center gap-2">
            <Plus size={13} /> {creating ? "Annuler" : "Nouvel événement"}
          </button>
        </div>
      </div>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import iCalendar (.ics)"
        description="Importer un fichier .ics exporté depuis Outlook, Google Calendar, Thunderbird… Les événements VEVENT seront ajoutés à l'agenda partagé."
        acceptedExtensions=".ics"
        doImport={(f) => api.importIcs(f) as Promise<{ ok: boolean; nb_crees: number }>}
        onSuccess={() => setTimeout(reload, 1500)}
      />

      {creating && (
        <div className="rounded-sm border border-brand-500/30 bg-brand-50/40 p-4 mb-6">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Titre" value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} className="col-span-2 px-2 py-1.5 border border-paper-200 rounded-sm text-sm" />
            <input type="datetime-local" value={form.debut} onChange={(e) => setForm({ ...form, debut: e.target.value })} className="px-2 py-1.5 border border-paper-200 rounded-sm text-sm" />
            <input type="datetime-local" value={form.fin} onChange={(e) => setForm({ ...form, fin: e.target.value })} className="px-2 py-1.5 border border-paper-200 rounded-sm text-sm" />
            <select value={form.type_event} onChange={(e) => setForm({ ...form, type_event: e.target.value })} className="px-2 py-1.5 border border-paper-200 rounded-sm text-sm bg-white">
              <option value="copil">COPIL</option>
              <option value="coproj">COPROJ</option>
              <option value="jalon">Jalon</option>
              <option value="rdv">Rendez-vous</option>
              <option value="deadline">Deadline</option>
              <option value="autre">Autre</option>
            </select>
            <input placeholder="Lieu" value={form.lieu} onChange={(e) => setForm({ ...form, lieu: e.target.value })} className="px-2 py-1.5 border border-paper-200 rounded-sm text-sm" />
            <input placeholder="Participants (usernames, séparés par virgule)" value={form.participants} onChange={(e) => setForm({ ...form, participants: e.target.value })} className="col-span-2 px-2 py-1.5 border border-paper-200 rounded-sm text-sm" />
            <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="col-span-2 px-2 py-1.5 border border-paper-200 rounded-sm text-sm h-16" />
          </div>
          <button onClick={create} className="mt-3 text-xs px-3 py-1.5 bg-ok-500 text-white rounded-sm">Créer et notifier</button>
        </div>
      )}

      {loading && <div className="text-sm text-ink-500 italic">Chargement…</div>}

      {!loading && days.length === 0 && (
        <div className="rounded-sm border border-paper-200 bg-paper-50 p-8 text-center text-sm text-ink-500">
          Aucun événement sur la période.
        </div>
      )}

      <div className="space-y-6">
        {days.map((day) => {
          const d = new Date(day + "T12:00:00Z");
          const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
          return (
            <div key={day}>
              <div className="text-[10px] uppercase tracking-widest text-ink-500 font-medium mb-2">{label}</div>
              <div className="space-y-2">
                {byDay[day].map((e) => {
                  const cfg = TYPE_COLORS[e.type_event] || TYPE_COLORS.autre;
                  const t = new Date(e.debut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={e.id} className="rounded-sm border border-paper-200 bg-white p-3 flex items-start gap-3">
                      <div className="w-16 text-sm text-ink-700 font-mono tabular-nums">{t}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-sm border ${cfg}`}>{e.type_event}</span>
                          <span className="text-sm font-medium text-ink-900">{e.titre}</span>
                        </div>
                        {e.lieu && <div className="text-xs text-ink-500 mt-0.5">📍 {e.lieu}</div>}
                        {e.description && <div className="text-xs text-ink-700 mt-1">{e.description}</div>}
                        {e.participants.length > 0 && (
                          <div className="text-[10px] text-ink-500 mt-1">
                            Participants : {e.participants.join(", ")} (org. {e.organisateur})
                          </div>
                        )}
                      </div>
                      <button onClick={() => remove(e.id)} className="p-1 hover:bg-paper-100 rounded text-ink-500 hover:text-danger-500" title="Supprimer">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
