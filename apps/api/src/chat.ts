import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { isValidObjectId, type Types } from "mongoose";
import { requireAuth, signToken } from "./auth.js";
import { emitToGroup } from "./socket.js";
import { escapeRegex } from "./security.js";
import { User, toPublicUser, type UserDoc } from "./models/User.js";
import { Group } from "./models/Group.js";
import { Message } from "./models/Message.js";

export const chatRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives, réessayez plus tard" },
});

/** Message dont le champ `sender` a été peuplé en document utilisateur. */
interface PopulatedMessage {
  _id: Types.ObjectId;
  groupId: Types.ObjectId;
  type: string;
  text?: string | null;
  listingId?: string | null;
  sender: UserDoc;
  createdAt: Date;
}

function serializeMessage(msg: PopulatedMessage): unknown {
  return {
    id: msg._id.toString(),
    groupId: msg.groupId.toString(),
    type: msg.type,
    text: msg.text ?? null,
    listingId: msg.listingId ?? null,
    sender: toPublicUser(msg.sender),
    createdAt: msg.createdAt,
  };
}

// --- Auth (public) ---------------------------------------------------------

chatRouter.post("/auth/register", authLimiter, async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "username et password requis" });
    return;
  }
  const cleaned = username.trim().toLowerCase();
  if (cleaned.length < 3) {
    res.status(400).json({ error: "Le nom d'utilisateur doit faire au moins 3 caractères" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Le mot de passe doit faire au moins 6 caractères" });
    return;
  }

  const existing = await User.findOne({ username: cleaned });
  if (existing) {
    res.status(409).json({ error: "Ce nom d'utilisateur est déjà pris" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    username: cleaned,
    passwordHash,
    displayName: username.trim(),
  });

  res.status(201).json({
    token: signToken(user._id.toString()),
    user: toPublicUser(user),
  });
});

chatRouter.post("/auth/login", authLimiter, async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "username et password requis" });
    return;
  }
  const user = await User.findOne({ username: username.trim().toLowerCase() });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "Identifiants invalides" });
    return;
  }
  res.json({
    token: signToken(user._id.toString()),
    user: toPublicUser(user),
  });
});

chatRouter.get("/auth/me", requireAuth, async (req: Request, res: Response) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: "Utilisateur introuvable" });
    return;
  }
  res.json({ user: toPublicUser(user) });
});

// --- Users -----------------------------------------------------------------

chatRouter.get("/users/search", requireAuth, async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.json([]);
    return;
  }
  const users = await User.find({
    username: { $regex: escapeRegex(q), $options: "i" },
    _id: { $ne: req.userId },
  })
    .limit(10)
    .lean();
  res.json(users.map((u) => toPublicUser(u as unknown as UserDoc)));
});

// --- Groups ----------------------------------------------------------------

chatRouter.get("/groups", requireAuth, async (req: Request, res: Response) => {
  const groups = await Group.find({ members: req.userId })
    .populate("members")
    .sort({ updatedAt: -1 })
    .lean();
  res.json(
    groups.map((g) => ({
      id: g._id.toString(),
      name: g.name,
      members: (g.members as unknown as UserDoc[]).map(toPublicUser),
      createdBy: g.createdBy.toString(),
    })),
  );
});

chatRouter.post("/groups", requireAuth, async (req: Request, res: Response) => {
  const { name, memberUsernames } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Le nom du groupe est requis" });
    return;
  }
  if (!Array.isArray(memberUsernames)) {
    res.status(400).json({ error: "memberUsernames doit être une liste" });
    return;
  }

  const cleaned = memberUsernames
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim().toLowerCase());

  const others = cleaned.length
    ? await User.find({ username: { $in: cleaned } })
    : [];

  // Ensemble unique de membres : créateur + utilisateurs trouvés.
  const memberIds = new Set<string>([req.userId!]);
  for (const u of others) memberIds.add(u._id.toString());

  if (memberIds.size < 2) {
    res.status(400).json({ error: "Un groupe doit contenir au moins 2 membres" });
    return;
  }

  const group = await Group.create({
    name: name.trim(),
    members: [...memberIds],
    createdBy: req.userId,
  });
  const populated = await group.populate("members");

  res.status(201).json({
    id: populated._id.toString(),
    name: populated.name,
    members: (populated.members as unknown as UserDoc[]).map(toPublicUser),
    createdBy: populated.createdBy.toString(),
  });
});

// --- Messages --------------------------------------------------------------

async function assertMember(
  groupId: string,
  userId: string,
): Promise<boolean> {
  if (!isValidObjectId(groupId)) return false;
  const group = await Group.findOne({ _id: groupId, members: userId }).select("_id");
  return Boolean(group);
}

chatRouter.get(
  "/groups/:id/messages",
  requireAuth,
  async (req: Request, res: Response) => {
    if (!(await assertMember(req.params.id, req.userId!))) {
      res.status(403).json({ error: "Accès refusé à ce groupe" });
      return;
    }
    const messages = await Message.find({ groupId: req.params.id })
      .populate("sender")
      .sort({ createdAt: 1 })
      .lean();
    res.json((messages as unknown as PopulatedMessage[]).map(serializeMessage));
  },
);

chatRouter.post(
  "/groups/:id/messages",
  requireAuth,
  async (req: Request, res: Response) => {
    if (!(await assertMember(req.params.id, req.userId!))) {
      res.status(403).json({ error: "Accès refusé à ce groupe" });
      return;
    }
    const { type, text, listingId } = req.body ?? {};
    if (type !== "text" && type !== "listing") {
      res.status(400).json({ error: "type doit être 'text' ou 'listing'" });
      return;
    }
    if (type === "text" && (typeof text !== "string" || !text.trim())) {
      res.status(400).json({ error: "text requis pour un message texte" });
      return;
    }
    if (type === "listing" && typeof listingId !== "string") {
      res.status(400).json({ error: "listingId requis pour un partage d'annonce" });
      return;
    }

    const created = await Message.create({
      groupId: req.params.id,
      sender: req.userId,
      type,
      text: type === "text" ? text.trim() : undefined,
      listingId: type === "listing" ? listingId : undefined,
    });
    const populated = await created.populate("sender");
    const payload = serializeMessage(
      populated as unknown as PopulatedMessage,
    );

    emitToGroup(req.params.id, "message:new", payload);
    res.status(201).json(payload);
  },
);
