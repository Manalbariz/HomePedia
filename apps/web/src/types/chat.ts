export interface User {
  id: string;
  username: string;
  displayName: string;
  color: string;
}

export interface Group {
  id: string;
  name: string;
  members: User[];
  createdBy: string;
}

export type MessageType = "text" | "listing";

export interface Message {
  id: string;
  groupId: string;
  type: MessageType;
  text: string | null;
  listingId: string | null;
  sender: User;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
