import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  createGroup as apiCreateGroup,
  fetchGroups,
} from "@/api/client";
import { getSocket } from "@/lib/socket";
import type { Group } from "@/types/chat";

interface UseGroupsResult {
  groups: Group[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  createGroup: (name: string, memberUsernames: string[]) => Promise<Group>;
}

export function useGroups(): UseGroupsResult {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGroups(await fetchGroups());
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Impossible de charger les groupes";
      setError(message);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createGroup = useCallback(
    async (name: string, memberUsernames: string[]) => {
      const group = await apiCreateGroup(name, memberUsernames);
      // Rejoint la room temps réel sans attendre une reconnexion.
      getSocket()?.emit("group:join", group.id);
      setGroups((prev) => [group, ...prev]);
      return group;
    },
    [],
  );

  return { groups, loading, error, reload: load, createGroup };
}
