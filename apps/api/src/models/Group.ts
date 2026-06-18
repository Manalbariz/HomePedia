import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const groupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    members: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export type GroupDoc = InferSchemaType<typeof groupSchema> & {
  _id: Types.ObjectId;
};

export const Group = model("Group", groupSchema);
