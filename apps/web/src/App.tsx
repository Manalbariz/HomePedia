import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppStatus } from "@/components/AppStatus";
import { Nav } from "@/components/Nav";
import { ThemeProvider } from "@/context/ThemeContext";
import { useListings } from "@/hooks/useListings";
import type { AppView } from "@/types/listing";
import { ChatView } from "@/views/ChatView";
import { HeroView } from "@/views/HeroView";
import { MapView } from "@/views/MapView";
import { MatchView } from "@/views/MatchView";

function AppContent() {
  const [view, setView] = useState<AppView>("hero");
  const { listings, loading, error, reload } = useListings();

  const status = <AppStatus loading={loading} error={error} onRetry={reload} />;

  if (loading || error) {
    return (
      <div className="theme-surface bg-background text-foreground min-h-screen">
        <Nav view={view} onNavigate={setView} />
        {status}
      </div>
    );
  }

  return (
    <div className="theme-surface bg-background text-foreground min-h-screen">
      <Nav view={view} onNavigate={setView} />
      <AnimatePresence mode="wait">
        {view === "hero" && (
          <motion.div
            key="hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <HeroView listings={listings} onNavigate={setView} />
          </motion.div>
        )}
        {view === "map" && (
          <motion.div
            key="map"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <MapView listings={listings} />
          </motion.div>
        )}
        {view === "match" && (
          <motion.div
            key="match"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <MatchView listings={listings} />
          </motion.div>
        )}
        {view === "chat" && (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ChatView listings={listings} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
