import type { Listing } from "@/types/listing";
import type { ListingFilters } from "@/types/filters";
import { filtersToSearchParams } from "@/types/filters";
import type { AuthResponse, Group, Message, User } from "@/types/chat";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

const TOKEN_KEY = "homepedia-token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export async function fetchListings(filters: ListingFilters = {}): Promise<Listing[]> {
  const qs = filtersToSearchParams(filters);
  const url = qs ? `${API_BASE}/api/listings?${qs}` : `${API_BASE}/api/listings`;
  const res = await fetch(url);
  return parseJson<Listing[]>(res);
}

export async function fetchListingById(id: string): Promise<Listing> {
  const res = await fetch(`${API_BASE}/api/listings/${encodeURIComponent(id)}`);
  return parseJson<Listing>(res);
}

export async function fetchSimilarListings(id: string): Promise<Listing[]> {
  const res = await fetch(
    `${API_BASE}/api/listings/${encodeURIComponent(id)}/similar`,
  );
  return parseJson<Listing[]>(res);
}

// --- Auth ------------------------------------------------------------------

export async function register(
  username: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return parseJson<AuthResponse>(res);
}

export async function login(
  username: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return parseJson<AuthResponse>(res);
}

export async function getMe(): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: authHeaders(),
  });
  const body = await parseJson<{ user: User }>(res);
  return body.user;
}

// --- Users / groups / messages --------------------------------------------

export async function searchUsers(q: string): Promise<User[]> {
  const res = await fetch(
    `${API_BASE}/api/users/search?q=${encodeURIComponent(q)}`,
    { headers: authHeaders() },
  );
  return parseJson<User[]>(res);
}

export async function fetchGroups(): Promise<Group[]> {
  const res = await fetch(`${API_BASE}/api/groups`, { headers: authHeaders() });
  return parseJson<Group[]>(res);
}

export async function createGroup(
  name: string,
  memberUsernames: string[],
): Promise<Group> {
  const res = await fetch(`${API_BASE}/api/groups`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name, memberUsernames }),
  });
  return parseJson<Group>(res);
}

export async function fetchMessages(groupId: string): Promise<Message[]> {
  const res = await fetch(
    `${API_BASE}/api/groups/${encodeURIComponent(groupId)}/messages`,
    { headers: authHeaders() },
  );
  return parseJson<Message[]>(res);
}

export async function sendMessage(
  groupId: string,
  payload:
    | { type: "text"; text: string }
    | { type: "listing"; listingId: string },
): Promise<Message> {
  const res = await fetch(
    `${API_BASE}/api/groups/${encodeURIComponent(groupId)}/messages`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    },
  );
  return parseJson<Message>(res);
export async function scrapeListingUrl(url: string): Promise<import("@/types/compare").ComparedListing> {
  const res = await fetch(`${API_BASE}/api/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return parseJson<import("@/types/compare").ComparedListing>(res);
}
