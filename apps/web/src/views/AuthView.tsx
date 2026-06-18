import { useState, type FormEvent } from "react";
import { MessageCircle } from "lucide-react";
import { ApiError } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

export function AuthView() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(username, password);
      } else {
        await register(username, password);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Une erreur est survenue, réessayez",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="theme-surface pt-[60px] min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mb-3">
            <MessageCircle size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-foreground">
            {mode === "login" ? "Connexion" : "Créer un compte"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            Connecte-toi pour discuter avec ton groupe coloc&apos;
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Nom d&apos;utilisateur
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent"
              placeholder="ex. sophie"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-500/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-white rounded-xl py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting
              ? "Patiente…"
              : mode === "login"
                ? "Se connecter"
                : "Créer mon compte"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "login" ? "register" : "login"));
            setError(null);
          }}
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "login"
            ? "Pas de compte ? Inscris-toi"
            : "Déjà un compte ? Connecte-toi"}
        </button>
      </div>
    </div>
  );
}
