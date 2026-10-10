"use client";
import { useState, useEffect, useTransition } from "react";
import { api } from "@/lib/api";
import { getToken, getUser } from "@/lib/auth";
import { Mic, PlayCircle, RefreshCw, Headphones, Calendar } from "lucide-react";

type B = { id: number; titre: string; script_texte: string; audio_path: string | null; duree_estimee_sec: number; jour: string; lu: boolean };

export default function BriefingPage() {
  const [today, setToday] = useState<B | null>(null);
  const [history, setHistory] = useState<B[]>([]);
  const [selected, setSelected] = useState<B | null>(null);
  const [generating, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const reload = async () => {
    setErr(null);
    try {
      const t = await api.getBriefingToday();
      setToday(t);
      const h = await api.listBriefings(14);
      setHistory(h);
      if (t && !selected) setSelected(t);
    } catch (e) { setErr(String(e)); }
  };

  useEffect(() => {
    setMounted(true);
    if (getUser()) reload();
    // eslint-disable-next-line
  }, []);

  // Charger l'audio du briefing sélectionné en tant que blob (pour injecter le Bearer)
  useEffect(() => {
    let revokeUrl: string | null = null;
    (async () => {
      if (!selected?.audio_path) { setAudioUrl(null); return; }
      const token = getToken();
      try {
        const res = await fetch(`/api/briefing/${selected.id}/audio`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("Audio indisponible");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        revokeUrl = url;
        setAudioUrl(url);
      } catch (e) { setErr(String(e)); setAudioUrl(null); }
    })();
    return () => { if (revokeUrl) URL.revokeObjectURL(revokeUrl); };
  }, [selected]);

  const generer = () => {
    start(async () => {
      setErr(null);
      try {
        const b = await api.generateBriefing();
        setToday(b);
        setSelected(b);
        await reload();
      } catch (e) { setErr(String(e)); }
    });
  };

  if (!mounted) return null;
  if (!getUser()) {
    return (
      <div className="px-10 py-8">
        <div className="rounded-sm border border-paper-200 bg-white p-6 text-sm text-ink-500">
          Connecte-toi pour consulter ton briefing personnel.
          <a href="/login" className="text-brand-500 underline ml-1">Se connecter →</a>
        </div>
      </div>
    );
  }

  return (
    <div className="px-10 py-8 max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-500 flex items-center gap-2">
            <Mic size={11} /> Briefing podcast
          </div>
          <h1 className="font-serif text-3xl text-ink-900 mt-1">Votre briefing quotidien</h1>
          <p className="text-sm text-ink-500 mt-1">
            Généré à partir de vos rendez-vous, notifications, phases en cours et activité récente.
            Audio en français synthétisé (gTTS).
          </p>
        </div>
        <button
          onClick={generer}
          disabled={generating}
          className="text-xs px-4 py-2 bg-brand-500 text-white rounded-sm hover:bg-brand-700 flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={13} className={generating ? "animate-spin" : ""} />
          {generating ? "Génération (10-20 s)…" : today ? "Régénérer aujourd'hui" : "Générer le briefing du jour"}
        </button>
      </div>

      {err && (
        <div className="rounded-sm border border-danger-500/30 bg-danger-50 px-4 py-2 text-sm text-ink-700 mb-4">
          {err}
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Player + script */}
        <div className="col-span-8">
          {selected ? (
            <div className="rounded-sm border border-paper-200 bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-paper-200 bg-brand-50/40">
                <div className="flex items-center gap-3">
                  <Headphones size={28} className="text-brand-700" />
                  <div className="flex-1">
                    <div className="text-[10px] uppercase tracking-widest text-ink-500">{selected.jour}</div>
                    <h2 className="font-serif text-lg text-ink-900">{selected.titre}</h2>
                    <div className="text-xs text-ink-500 mt-0.5">
                      Durée estimée {Math.floor(selected.duree_estimee_sec / 60)}:{String(selected.duree_estimee_sec % 60).padStart(2, "0")}
                      {selected.lu && " · ✓ écouté"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-5">
                {audioUrl ? (
                  <audio controls src={audioUrl} className="w-full mb-5">
                    Lecteur audio non supporté.
                  </audio>
                ) : (
                  <div className="rounded-sm border border-dashed border-paper-200 p-4 text-xs text-ink-500 italic text-center mb-5">
                    Audio en cours de chargement…
                  </div>
                )}
                <div className="text-[10px] uppercase tracking-widest text-ink-500 mb-2">Script</div>
                <p className="text-sm text-ink-700 leading-relaxed whitespace-pre-wrap">{selected.script_texte}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-sm border border-paper-200 bg-paper-50 p-8 text-center">
              <PlayCircle size={48} className="mx-auto text-ink-300 mb-3" />
              <p className="text-sm text-ink-500 mb-4">
                Aucun briefing pour aujourd'hui. Clique sur « Générer » pour créer ton briefing.
              </p>
            </div>
          )}
        </div>

        {/* Historique */}
        <div className="col-span-4">
          <div className="rounded-sm border border-paper-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-paper-200 flex items-center gap-2">
              <Calendar size={11} className="text-ink-500" />
              <div className="text-[10px] uppercase tracking-widest text-ink-500 font-medium">Historique 14 jours</div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {history.length === 0 && (
                <div className="p-4 text-xs text-ink-500 italic">Aucun historique.</div>
              )}
              {history.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelected(b)}
                  className={`w-full text-left px-4 py-2 border-b border-paper-200 last:border-b-0 hover:bg-paper-50 ${selected?.id === b.id ? "bg-brand-50/40" : ""}`}
                >
                  <div className="text-xs text-ink-900 font-medium">{b.jour}</div>
                  <div className="text-[10px] text-ink-500 truncate">{b.titre}</div>
                  <div className="text-[10px] text-ink-500 mt-0.5">
                    {Math.floor(b.duree_estimee_sec / 60)}:{String(b.duree_estimee_sec % 60).padStart(2, "0")}
                    {b.lu && " · ✓"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
