import { useState } from "react";
import { Building2, Send } from "lucide-react";
import type { Listing } from "@/types/listing";
import { MOCK_FRIENDS, MOCK_MESSAGES, type ChatMessage } from "@/mocks/chat";
import { ListingCard } from "@/components/ListingCard";

interface ChatViewProps {
  listings: Listing[];
}

export function ChatView({ listings }: ChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [draft, setDraft] = useState("");
  const [activeFriend, setActiveFriend] = useState(MOCK_FRIENDS[0]!.id);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [
      ...m,
      { id: String(Date.now()), from: "me", text, time: "maintenant", type: "text" },
    ]);
    setDraft("");
  };

  const renderListing = (listing: Listing) => (
    <div className="max-w-xs">
      <ListingCard listing={listing} compact />
    </div>
  );

  return (
    <div className="pt-[60px] h-screen flex bg-background overflow-hidden">
      <aside className="w-64 border-r border-border flex-shrink-0 p-4 hidden md:block">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Amis
        </h2>
        <ul className="space-y-2">
          {MOCK_FRIENDS.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setActiveFriend(f.id)}
                className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors ${
                  activeFriend === f.id ? "bg-secondary" : "hover:bg-secondary/50"
                }`}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: f.color }}
                >
                  {f.avatar}
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-foreground">{f.name}</div>
                  <div className="text-[10px] text-muted-foreground capitalize">{f.status}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="font-semibold text-foreground">Groupe coloc&apos;</div>
            <div className="text-xs text-muted-foreground">3 membres · en ligne</div>
          </div>
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs bg-secondary border border-border px-3 py-2 rounded-full text-muted-foreground hover:text-foreground"
          >
            <Building2 size={12} /> Partager une annonce
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => {
            const isMe = msg.from === "me";
            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-1`}
                >
                  {!isMe && (
                    <span className="text-[10px] text-muted-foreground px-1">{msg.from}</span>
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
                      const listing = listings.find((l) => l.id === msg.listingId);
                      return listing ? (
                        renderListing(listing)
                      ) : (
                        <p className="text-xs text-muted-foreground">Annonce introuvable</p>
                      );
                    })()
                  )}
                  <span className="text-[10px] text-muted-foreground px-1">{msg.time}</span>
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
      </div>
    </div>
  );
}
