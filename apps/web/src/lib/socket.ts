import { io, type Socket } from "socket.io-client";

// En dev, Vite proxifie /socket.io vers l'API (port 3001). En prod, on cible
// VITE_API_BASE si défini, sinon la même origine.
const SOCKET_URL = import.meta.env.VITE_API_BASE ?? "";

let socket: Socket | null = null;

/** (Re)connecte le socket avec le token JWT courant. */
export function connectSocket(token: string): Socket {
  if (socket) socket.disconnect();
  socket = SOCKET_URL
    ? io(SOCKET_URL, { auth: { token } })
    : io({ auth: { token } });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
