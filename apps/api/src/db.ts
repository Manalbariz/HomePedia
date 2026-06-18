import mongoose from "mongoose";

export async function connectMongo(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI manquant — copiez apps/api/.env.example en apps/api/.env et renseignez la chaîne de connexion.",
    );
  }

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB error:", err);
  });

  await mongoose.connect(uri);
  console.log("MongoDB connecté");
}
