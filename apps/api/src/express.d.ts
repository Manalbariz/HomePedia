// Augmente le type Request d'Express pour transporter l'identité authentifiée.
import "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
