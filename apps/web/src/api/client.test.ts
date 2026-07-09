import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, clearToken, fetchListings, getToken, setToken } from "./client";

describe("api client", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stocke et lit le token", () => {
    setToken("abc");
    expect(getToken()).toBe("abc");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("fetchListings appelle /api/listings avec les filtres", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    await fetchListings({ city: "paris", minRooms: 2 });

    expect(fetch).toHaveBeenCalledWith("/api/listings?city=paris&minRooms=2");
  });

  it("lève ApiError avec le message serveur", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ error: "Token invalide ou expiré" }),
    } as Response);

    await expect(fetchListings()).rejects.toEqual(
      expect.objectContaining<Partial<ApiError>>({
        name: "ApiError",
        status: 401,
        message: "Token invalide ou expiré",
      }),
    );
  });
});
