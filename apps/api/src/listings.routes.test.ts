import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { resetListingsStoreForTests } from "./listings/repository.js";

describe("listing routes", () => {
  beforeEach(() => {
    resetListingsStoreForTests();
  });

  const app = createApp();

  it("GET /api/health renvoie ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("homepedia-api");
  });

  it("GET /api/listings filtre par city", async () => {
    const res = await request(app).get("/api/listings").query({ city: "paris" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    for (const listing of res.body) {
      expect(listing.address.toLowerCase()).toContain("paris");
    }
  });

  it("GET /api/listings?limit= pagine la réponse", async () => {
    const res = await request(app).get("/api/listings").query({ limit: 5, offset: 0 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: expect.any(Number),
      limit: 5,
      offset: 0,
    });
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeLessThanOrEqual(5);
  });

  it("GET /api/listings/:id renvoie 404 si inconnu", async () => {
    const res = await request(app).get("/api/listings/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("POST /api/listings valide le corps", async () => {
    const res = await request(app).post("/api/listings").send({ title: "incomplete" });
    expect(res.status).toBe(400);
  });
});
