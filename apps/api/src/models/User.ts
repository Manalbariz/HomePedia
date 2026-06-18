import { Schema, model, type InferSchemaType, type Types } from "mongoose";

// Palette réutilisée pour les avatars (cohérente avec l'UI web).
const AVATAR_COLORS = [
  "#FF4B5C",
  "#4F58E8",
  "#2EC4B6",
  "#F4A261",
  "#9B5DE5",
  "#06B6D4",
];

export function pickColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!;
}

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },
    color: { type: String, required: true, default: pickColor },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };

/** Représentation publique d'un utilisateur (sans le hash du mot de passe). */
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  color: string;
}

export function toPublicUser(user: UserDoc): PublicUser {
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    color: user.color,
  };
}

export const User = model("User", userSchema);
