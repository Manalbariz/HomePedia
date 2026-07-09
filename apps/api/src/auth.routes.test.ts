import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { connectMongo } from "./db.js";

describe("auth routes", () => {
  let mongod: MongoMemoryServer;
  const app = createApp();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.JWT_SECRET = "test-secret-for-vitest";
    await connectMongo();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
  });

  it("POST /api/auth/register crée un utilisateur", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "alice", password: "secret12" });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user.username).toBe("alice");
  });

  it("POST /api/auth/login authentifie un utilisateur existant", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ username: "bob", password: "secret12" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "bob", password: "secret12" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
  });

  it("GET /api/auth/me exige un token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
