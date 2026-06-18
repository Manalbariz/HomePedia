import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchMessages, sendMessage } from "@/api/client";
import { getSocket } from "@/lib/socket";
import type { Message } from "@/types/chat";

interface UseGroupMessagesResult {
  messages: Message[];
  loading: boolean;
  error: string | null;
  sendText: (text: string) => Promise<void>;
  sendListing: (listingId: string) => Promise<void>;
}

export function useGroupMessages(
  groupId: string | null,
): UseGroupMessagesResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charge l'historique quand le groupe actif change.
  useEffect(() => {
    if (!groupId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMessages(groupId)
      .then((data) => {
        if (!cancelled) setMessages(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof ApiError
            ? e.message
            : "Impossible de charger les messages",
        );
        setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  // Réception temps réel des nouveaux messages du groupe actif.
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !groupId) return;
    const onNew = (msg: Message) => {
      if (msg.groupId !== groupId) return;
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
    };
    socket.on("message:new", onNew);
    return () => {
      socket.off("message:new", onNew);
    };
  }, [groupId]);

  const sendText = useCallback(
    async (text: string) => {
      if (!groupId) return;
      await sendMessage(groupId, { type: "text", text });
    },
    [groupId],
  );

  const sendListing = useCallback(
    async (listingId: string) => {
      if (!groupId) return;
      await sendMessage(groupId, { type: "listing", listingId });
    },
    [groupId],
  );

  return { messages, loading, error, sendText, sendListing };
}
