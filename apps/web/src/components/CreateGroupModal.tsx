import { useEffect, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { ApiError, searchUsers } from "@/api/client";
import type { Group, User } from "@/types/chat";

interface CreateGroupModalProps {
  onClose: () => void;
  onCreate: (name: string, memberUsernames: string[]) => Promise<Group>;
}

export function CreateGroupModal({ onClose, onCreate }: CreateGroupModalProps) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [selected, setSelected] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Recherche d'utilisateurs (debounce léger).
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      searchUsers(q)
        .then((users) => {
          if (!cancelled) setResults(users);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const toggle = (user: User) => {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Donne un nom au groupe");
      return;
    }
    if (selected.length < 1) {
      setError("Ajoute au moins un autre membre");
      return;
    }
    setSubmitting(true);
    try {
      await onCreate(
        name.trim(),
        selected.map((u) => u.username),
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Impossible de créer le groupe",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">Nouveau groupe</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Nom du groupe
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex. Coloc Bordeaux"
          className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent mb-4"
        />

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selected.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u)}
                className="flex items-center gap-1 text-xs bg-primary/15 text-primary px-2.5 py-1 rounded-full"
              >
                {u.displayName}
                <X size={11} />
              </button>
            ))}
          </div>
        )}

        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Ajouter des membres
        </label>
        <div className="relative mb-2">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom d'utilisateur…"
            className="w-full bg-secondary border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <ul className="space-y-1 mb-4 min-h-[2rem]">
          {results.map((u) => {
            const isSelected = selected.some((s) => s.id === u.id);
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => toggle(u)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-secondary"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: u.color }}
                  >
                    {u.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm text-foreground flex-1 text-left">
                    {u.displayName}
                    <span className="text-muted-foreground"> @{u.username}</span>
                  </span>
                  {isSelected && <Check size={16} className="text-primary" />}
                </button>
              </li>
            );
          })}
          {query.trim() && results.length === 0 && (
            <li className="text-xs text-muted-foreground px-2 py-1">
              Aucun utilisateur trouvé
            </li>
          )}
        </ul>

        {error && (
          <p className="text-xs text-red-500 bg-red-500/10 rounded-lg px-3 py-2 mb-3">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full bg-primary text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
        >
          {submitting ? "Création…" : "Créer le groupe"}
        </button>
      </div>
    </div>
  );
}
