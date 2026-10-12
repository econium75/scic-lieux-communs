"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { UserPlus, Trash2, Edit2, Check, X } from "lucide-react";

type U = { id: number; username: string; email: string; role: string; nom_affichage: string; actif: boolean };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<U[]>([]);
  const [me, setMe] = useState<ReturnType<typeof getUser>>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBuf, setEditBuf] = useState<Partial<U> & { password?: string }>({});
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "lecture", email: "", nom_affichage: "" });
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await api.listUsers();
      setUsers(list);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMe(getUser());
    reload();
  }, []);

  if (me && me.role !== "admin") {
    return (
      <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
        <div className="rounded-sm border border-danger-500/30 bg-danger-50 p-6 text-sm text-ink-700">
          Cette page est réservée aux administrateurs. Votre rôle actuel : <strong>{me.role}</strong>.
        </div>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8">
        <div className="rounded-sm border border-paper-200 bg-white p-6 text-sm text-ink-500">
          Vous devez vous connecter. Rendez-vous sur <a href="/login" className="text-brand-500 underline">/login</a>.
        </div>
      </div>
    );
  }

  const startEdit = (u: U) => {
    setEditingId(u.id);
    setEditBuf({ email: u.email, role: u.role, nom_affichage: u.nom_affichage, actif: u.actif });
  };
  const saveEdit = async (id: number) => {
    try {
      await api.updateUser(id, editBuf);
      setEditingId(null);
      setEditBuf({});
      await reload();
    } catch (e) { setErr(String(e)); }
  };
  const cancelEdit = () => { setEditingId(null); setEditBuf({}); };
  const createOne = async () => {
    try {
      await api.createUser(newUser);
      setCreating(false);
      setNewUser({ username: "", password: "", role: "lecture", email: "", nom_affichage: "" });
      await reload();
    } catch (e) { setErr(String(e)); }
  };
  const removeOne = async (id: number) => {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    try { await api.deleteUser(id); await reload(); } catch (e) { setErr(String(e)); }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-4 sm:py-6 lg:py-8 max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-ink-500">Administration</div>
          <h1 className="font-serif text-2xl lg:text-3xl text-ink-900 mt-1">Utilisateurs & autorisations</h1>
          <p className="text-sm text-ink-500 mt-1">
            3 rôles : <strong>admin</strong> (tout) · <strong>saisie</strong> (CRUD + exports) · <strong>lecture</strong> (lecture + exports).
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="text-xs px-4 py-2 bg-brand-500 text-white rounded-sm hover:bg-brand-700 flex items-center gap-2"
        >
          <UserPlus size={13} /> Nouvel utilisateur
        </button>
      </div>

      {err && (
        <div className="rounded-sm border border-danger-500/30 bg-danger-50 px-4 py-2 text-sm text-ink-700 mb-4">
          Erreur : {err}
        </div>
      )}

      {creating && (
        <div className="rounded-sm border border-brand-500/30 bg-brand-50/40 p-4 mb-4">
          <div className="text-[10px] uppercase tracking-widest text-ink-500 mb-3">Création</div>
          <div className="grid grid-cols-5 gap-3">
            <input placeholder="username" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} className="px-2 py-1.5 border border-paper-200 rounded-sm text-sm" />
            <input type="password" placeholder="mot de passe" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="px-2 py-1.5 border border-paper-200 rounded-sm text-sm" />
            <input placeholder="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} className="px-2 py-1.5 border border-paper-200 rounded-sm text-sm" />
            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className="px-2 py-1.5 border border-paper-200 rounded-sm text-sm bg-white">
              <option value="lecture">lecture</option>
              <option value="saisie">saisie</option>
              <option value="admin">admin</option>
            </select>
            <input placeholder="nom affichage" value={newUser.nom_affichage} onChange={(e) => setNewUser({ ...newUser, nom_affichage: e.target.value })} className="px-2 py-1.5 border border-paper-200 rounded-sm text-sm" />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={createOne} className="text-xs px-3 py-1.5 bg-ok-500 text-white rounded-sm hover:bg-ok-500/80">Créer</button>
            <button onClick={() => { setCreating(false); setErr(null); }} className="text-xs px-3 py-1.5 border border-ink-300 text-ink-700 rounded-sm">Annuler</button>
          </div>
        </div>
      )}

      <div className="rounded-sm border border-paper-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-ink-500 bg-paper-50">
              <th className="text-left px-4 py-2 font-medium">Username</th>
              <th className="text-left px-4 py-2 font-medium">Nom affichage</th>
              <th className="text-left px-4 py-2 font-medium">Email</th>
              <th className="text-left px-4 py-2 font-medium">Rôle</th>
              <th className="text-left px-4 py-2 font-medium">Actif</th>
              <th className="text-right px-4 py-2 font-medium w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-500 italic">Chargement…</td></tr>}
            {!loading && users.map((u) => (
              <tr key={u.id} className="border-t border-paper-200 hover:bg-paper-50/50">
                <td className="px-4 py-1.5 font-mono text-xs">{u.username}</td>
                <td className="px-4 py-1.5">
                  {editingId === u.id ? (
                    <input value={editBuf.nom_affichage ?? ""} onChange={(e) => setEditBuf({ ...editBuf, nom_affichage: e.target.value })} className="px-2 py-0.5 border border-paper-200 rounded-sm text-xs w-full" />
                  ) : u.nom_affichage || "—"}
                </td>
                <td className="px-4 py-1.5 text-xs">
                  {editingId === u.id ? (
                    <input value={editBuf.email ?? ""} onChange={(e) => setEditBuf({ ...editBuf, email: e.target.value })} className="px-2 py-0.5 border border-paper-200 rounded-sm text-xs w-full" />
                  ) : u.email || "—"}
                </td>
                <td className="px-4 py-1.5">
                  {editingId === u.id ? (
                    <select value={editBuf.role ?? ""} onChange={(e) => setEditBuf({ ...editBuf, role: e.target.value })} className="px-2 py-0.5 border border-paper-200 rounded-sm text-xs bg-white">
                      <option value="lecture">lecture</option>
                      <option value="saisie">saisie</option>
                      <option value="admin">admin</option>
                    </select>
                  ) : (
                    <span className={`text-[10px] uppercase tracking-widest font-medium px-2 py-0.5 rounded-sm border ${
                      u.role === "admin" ? "bg-brand-50 text-brand-700 border-brand-500/30" :
                      u.role === "saisie" ? "bg-ok-50 text-ok-500 border-ok-500/30" :
                      "bg-paper-100 text-ink-500 border-paper-200"
                    }`}>{u.role}</span>
                  )}
                </td>
                <td className="px-4 py-1.5">
                  {editingId === u.id ? (
                    <input type="checkbox" checked={!!editBuf.actif} onChange={(e) => setEditBuf({ ...editBuf, actif: e.target.checked })} className="accent-brand-500" />
                  ) : u.actif ? "✓" : "—"}
                </td>
                <td className="px-4 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    {editingId === u.id ? (
                      <>
                        <button onClick={() => saveEdit(u.id)} className="p-1.5 hover:bg-paper-100 rounded text-ok-500" title="Enregistrer"><Check size={14} /></button>
                        <button onClick={cancelEdit} className="p-1.5 hover:bg-paper-100 rounded text-ink-500" title="Annuler"><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(u)} className="p-1.5 hover:bg-paper-100 rounded text-ink-500 hover:text-brand-500" title="Modifier"><Edit2 size={14} /></button>
                        {u.username !== me?.username && (
                          <button onClick={() => removeOne(u.id)} className="p-1.5 hover:bg-paper-100 rounded text-ink-500 hover:text-danger-500" title="Supprimer"><Trash2 size={14} /></button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
