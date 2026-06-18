import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const messageSchema = new Schema(
  {
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["text", "listing"], required: true },
    text: { type: String },
    listingId: { type: String },
  },
  { timestamps: true },
);

export type MessageDoc = InferSchemaType<typeof messageSchema> & {
  _id: Types.ObjectId;
};

export const Message = model("Message", messageSchema);
