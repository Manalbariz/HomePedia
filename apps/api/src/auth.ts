import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

interface TokenPayload {
  userId: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET manquant — voir apps/api/.env.example");
  }
  return secret;
}

export function signToken(userId: string): string {
  return jwt.sign({ userId } satisfies TokenPayload, getSecret(), {
    expiresIn: "30d",
  });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, getSecret()) as TokenPayload;
}

/** Récupère le token depuis l'en-tête Authorization: Bearer <token>. */
export function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

/** Middleware Express : exige un token valide, expose req.userId. */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentification requise" });
    return;
  }
  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
  }
}
