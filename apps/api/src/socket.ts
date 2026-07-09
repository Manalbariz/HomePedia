import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { isValidObjectId } from "mongoose";
import { verifyToken } from "./auth.js";
import { Group } from "./models/Group.js";
import { getCorsOrigins } from "./security.js";

let io: Server | null = null;

function roomFor(groupId: string): string {
  return `group:${groupId}`;
}

export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: getCorsOrigins(), credentials: true },
  });

  // Authentification du handshake via le token passé dans `auth.token`.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error("Authentification requise"));
      return;
    }
    try {
      socket.data.userId = verifyToken(token).userId;
      next();
    } catch {
      next(new Error("Token invalide"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.data.userId as string;

    // Rejoint une room par groupe dont l'utilisateur est membre.
    const groups = await Group.find({ members: userId }).select("_id").lean();
    for (const g of groups) {
      void socket.join(roomFor(g._id.toString()));
    }

    // Permet de rejoindre un groupe fraîchement créé sans reconnexion.
    socket.on("group:join", async (groupId: string) => {
      if (typeof groupId !== "string" || !isValidObjectId(groupId)) return;
      const group = await Group.findOne({ _id: groupId, members: userId }).select("_id");
      if (group) void socket.join(roomFor(groupId));
    });
  });

  return io;
}

/** Diffuse un évènement à tous les membres connectés d'un groupe. */
export function emitToGroup(
  groupId: string,
  event: string,
  payload: unknown,
): void {
  io?.to(roomFor(groupId)).emit(event, payload);
}
