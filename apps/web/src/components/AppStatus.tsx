import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

interface AppStatusProps {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function AppStatus({ loading, error, onRetry }: AppStatusProps) {
  if (loading) {
    return (
      <div className="pt-[60px] min-h-screen flex flex-col items-center justify-center gap-4 text-muted-foreground">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="text-sm">Chargement des annonces…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-[60px] min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertCircle size={40} className="text-primary" />
        <p className="text-foreground font-semibold">API indisponible</p>
        <p className="text-sm text-muted-foreground max-w-md">{error}</p>
        <p className="text-xs text-muted-foreground max-w-md">
          Lancez l&apos;API :{" "}
          <code className="bg-secondary px-2 py-1 rounded text-foreground">
            cd apps/api && npm run dev
          </code>
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-primary/90"
        >
          <RefreshCw size={14} /> Réessayer
        </button>
      </div>
    );
  }

  return null;
}
