import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractToken, requireAuth, signToken, verifyToken } from "./auth.js";

describe("auth", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret-for-vitest";
  });

  it("round-trip signToken / verifyToken", () => {
    const token = signToken("user-123");
    expect(verifyToken(token).userId).toBe("user-123");
  });

  it("extractToken lit le header Bearer", () => {
    const req = { headers: { authorization: "Bearer abc.def.ghi" } } as Request;
    expect(extractToken(req)).toBe("abc.def.ghi");
  });

  it("requireAuth renvoie 401 sans token", () => {
    const req = { headers: {} } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireAuth appelle next avec un token valide", () => {
    const token = signToken("user-456");
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe("user-456");
  });
});
