"use client";
import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Save, Type } from "lucide-react";
import { collab } from "@/lib/collab";
import { cn } from "@/lib/format";
import { Bouton, champ } from "./modal";

const L = 600;
const H = 200;

/** Zone de dessin (souris, doigt, stylet) ou signature tapée, exportée en PNG transparent. */
function Pad({ onChange, initial, hauteur = H, police = 64 }: { onChange: (png: string) => void; initial?: string; hauteur?: number; police?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dessin = useRef(false);
  const vide = useRef(true);
  const [mode, setMode] = useState<"dessin" | "texte">("dessin");
  const [texte, setTexte] = useState("");

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, L, hauteur);
    if (initial) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, L, hauteur);
        vide.current = false;
      };
      img.src = initial;
    }
  }, [initial, hauteur]);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * L, y: ((e.clientY - r.top) / r.height) * hauteur };
  };
  const exporter = () => onChange(vide.current ? "" : ref.current!.toDataURL("image/png"));

  const effacer = () => {
    ref.current!.getContext("2d")!.clearRect(0, 0, L, hauteur);
    vide.current = true;
    exporter();
  };

  const ecrire = (t: string) => {
    setTexte(t);
    const ctx = ref.current!.getContext("2d")!;
    ctx.clearRect(0, 0, L, hauteur);
    ctx.fillStyle = "#1a2a52";
    ctx.font = `${police}px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(t, L / 2, hauteur / 2, L - 20);
    vide.current = !t.trim();
    exporter();
  };

  return (
    <div>
      <div className="flex gap-1 mb-1.5">
        <button type="button" onClick={() => { setMode("dessin"); effacer(); }} className={cn("text-[11px] px-2 py-1 rounded-sm border inline-flex items-center gap-1", mode === "dessin" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-paper-200 text-ink-500")}>
          <PenLine size={11} /> Dessiner
        </button>
        <button type="button" onClick={() => { setMode("texte"); ecrire(texte); }} className={cn("text-[11px] px-2 py-1 rounded-sm border inline-flex items-center gap-1", mode === "texte" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-paper-200 text-ink-500")}>
          <Type size={11} /> Taper mon nom
        </button>
        <button type="button" onClick={() => { setTexte(""); effacer(); }} className="ml-auto text-[11px] px-2 py-1 rounded-sm text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
          <Eraser size={11} /> Effacer
        </button>
      </div>
      {mode === "texte" && <input className={cn(champ, "mb-1.5")} value={texte} onChange={(e) => ecrire(e.target.value)} placeholder="Prénom Nom" />}
      <canvas
        ref={ref}
        width={L}
        height={hauteur}
        className={cn("w-full rounded-sm border border-dashed border-ink-300 bg-white touch-none", mode === "dessin" ? "cursor-crosshair" : "")}
        style={{ aspectRatio: `${L} / ${hauteur}` }}
        onPointerDown={(e) => {
          if (mode !== "dessin") return;
          dessin.current = true;
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          const ctx = ref.current!.getContext("2d")!;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!dessin.current) return;
          const ctx = ref.current!.getContext("2d")!;
          const p = pos(e);
          ctx.lineWidth = 3.2;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = "#1a2a52";
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          vide.current = false;
        }}
        onPointerUp={() => {
          if (!dessin.current) return;
          dessin.current = false;
          exporter();
        }}
      />
    </div>
  );
}

export function MaSignature({ onEnregistree, compact = false }: { onEnregistree?: () => void; compact?: boolean }) {
  const [sig, setSig] = useState("");
  const [paraphe, setParaphe] = useState("");
  const [initial, setInitial] = useState<{ image: string; paraphe: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    collab.maSignature().then((s) => {
      setInitial({ image: s.image, paraphe: s.paraphe });
      setSig(s.image);
      setParaphe(s.paraphe);
    }).catch(() => setInitial({ image: "", paraphe: "" }));
  }, []);

  const enregistrer = async () => {
    if (!sig) return setMsg({ ok: false, t: "Dessinez ou tapez votre signature." });
    setBusy(true);
    try {
      await collab.enregistrerSignature(sig, paraphe);
      setMsg({ ok: true, t: "Signature enregistrée." });
      onEnregistree?.();
    } catch (e) {
      setMsg({ ok: false, t: String((e as Error).message || e) });
    } finally {
      setBusy(false);
    }
  };

  if (!initial) return <div className="text-xs text-ink-500 italic">Chargement…</div>;
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] text-ink-700 mb-1">Signature</div>
        <Pad initial={initial.image} onChange={setSig} />
      </div>
      {!compact && (
        <div>
          <div className="text-[11px] text-ink-700 mb-1">Paraphe / initiales (facultatif — sinon la signature est utilisée)</div>
          <Pad initial={initial.paraphe} onChange={setParaphe} hauteur={120} police={56} />
        </div>
      )}
      <div className="flex items-center gap-3">
        <Bouton onClick={enregistrer} disabled={busy} variante="primaire"><Save size={13} /> Enregistrer ma signature</Bouton>
        {msg && <span className={cn("text-xs", msg.ok ? "text-ok-500" : "text-danger-500")}>{msg.t}</span>}
      </div>
      <p className="text-[11px] text-ink-500 leading-relaxed">
        Votre signature reste dans votre profil et n'est apposée que lorsque vous la placez vous-même sur un document.
        Chaque signature est horodatée et associée à l'empreinte SHA-256 du fichier (signature électronique simple, eIDAS).
      </p>
    </div>
  );
}
