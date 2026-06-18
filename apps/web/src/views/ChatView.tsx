import { useEffect, useRef, useState } from "react";
import { Building2, Plus, Send } from "lucide-react";
import type { Listing } from "@/types/listing";
import { useAuth } from "@/context/AuthContext";
import { useGroups } from "@/hooks/useGroups";
import { useGroupMessages } from "@/hooks/useGroupMessages";
import { AuthView } from "@/views/AuthView";
import { CreateGroupModal } from "@/components/CreateGroupModal";
import { ListingCard } from "@/components/ListingCard";

interface ChatViewProps {
  listings: Listing[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatView({ listings }: ChatViewProps) {
  const { user } = useAuth();
  const { groups, loading: groupsLoading, createGroup } = useGroups();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showListingPicker, setShowListingPicker] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendText, sendListing } = useGroupMessages(activeGroupId);
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;

  // Sélectionne automatiquement le premier groupe une fois chargés.
  useEffect(() => {
    if (!activeGroupId && groups.length > 0) {
      setActiveGroupId(groups[0]!.id);
    }
  }, [groups, activeGroupId]);

  // Défile vers le bas à l'arrivée de nouveaux messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  if (!user) {
    return <AuthView />;
  }

  const send = () => {
    const text = draft.trim();
    if (!text || !activeGroupId) return;
    void sendText(text);
    setDraft("");
  };

  const shareListing = (id: string) => {
    void sendListing(id);
    setShowListingPicker(false);
  };

  return (
    <div className="theme-surface pt-[60px] h-screen flex bg-background overflow-hidden">
      <aside className="w-64 border-r border-border flex-shrink-0 p-4 hidden md:flex md:flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Groupes
          </h2>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="p-1 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground"
            aria-label="Nouveau groupe"
          >
            <Plus size={16} />
          </button>
        </div>

        {groupsLoading ? (
          <p className="text-xs text-muted-foreground">Chargement…</p>
        ) : groups.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucun groupe. Crée-en un pour commencer à discuter.
          </p>
        ) : (
          <ul className="space-y-2 overflow-y-auto">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setActiveGroupId(g.id)}
                  className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors ${
                    activeGroupId === g.id
                      ? "bg-secondary"
                      : "hover:bg-secondary/50"
                  }`}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white bg-accent">
                    {g.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="text-left min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {g.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {g.members.length} membres
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {activeGroup ? (
          <>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div>
                <div className="font-semibold text-foreground">
                  {activeGroup.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {activeGroup.members.map((m) => m.displayName).join(", ")}
                </div>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowListingPicker((v) => !v)}
                  className="flex items-center gap-1.5 text-xs bg-secondary border border-border px-3 py-2 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <Building2 size={12} /> Partager une annonce
                </button>
                {showListingPicker && (
                  <div className="absolute right-0 mt-2 w-64 max-h-80 overflow-y-auto bg-card border border-border rounded-xl p-2 z-20 shadow-xl">
                    {listings.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2">
                        Aucune annonce disponible
                      </p>
                    ) : (
                      listings.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => shareListing(l.id)}
                          className="w-full text-left p-2 rounded-lg hover:bg-secondary"
                        >
                          <div className="text-sm font-medium text-foreground truncate">
                            {l.title}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {l.price.toLocaleString("fr-FR")} € · {l.address}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => {
                const isMe = msg.sender.id === user.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-1`}
                    >
                      {!isMe && (
                        <span className="text-[10px] text-muted-foreground px-1">
                          {msg.sender.displayName}
                        </span>
                      )}
                      {msg.type === "text" ? (
                        <div
                          className={`px-4 py-2.5 rounded-2xl text-sm ${
                            isMe
                              ? "bg-primary text-white rounded-br-md"
                              : "bg-secondary text-foreground rounded-bl-md"
                          }`}
                        >
                          {msg.text}
                        </div>
                      ) : (
                        (() => {
                          const listing = listings.find(
                            (l) => l.id === msg.listingId,
                          );
                          return listing ? (
                            <div className="max-w-xs">
                              <ListingCard listing={listing} compact />
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Annonce introuvable
                            </p>
                          );
                        })()
                      )}
                      <span className="text-[10px] text-muted-foreground px-1">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-border flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Écrire un message…"
                className="flex-1 bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={send}
                className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white hover:bg-primary/90"
                aria-label="Envoyer"
              >
                <Send size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <p className="text-muted-foreground mb-3">
              {groups.length === 0
                ? "Tu n'as pas encore de groupe."
                : "Sélectionne un groupe pour discuter."}
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 bg-primary text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-primary/90"
            >
              <Plus size={14} /> Nouveau groupe
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreate={async (name, members) => {
            const group = await createGroup(name, members);
            setActiveGroupId(group.id);
            return group;
          }}
        />
      )}
    </div>
  );
}
