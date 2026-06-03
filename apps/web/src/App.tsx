import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Nav } from "@/components/Nav";
import { MOCK_LISTINGS } from "@/mocks/listings";
import type { AppView } from "@/types/listing";
import { ChatView } from "@/views/ChatView";
import { HeroView } from "@/views/HeroView";
import { MapView } from "@/views/MapView";
import { MatchView } from "@/views/MatchView";

export default function App() {
  const [view, setView] = useState<AppView>("hero");

  return (
    <div className="bg-background text-foreground min-h-screen">
      <Nav view={view} onNavigate={setView} />
      <AnimatePresence mode="wait">
        {view === "hero" && (
          <motion.div
            key="hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <HeroView listings={MOCK_LISTINGS} onNavigate={setView} />
          </motion.div>
        )}
        {view === "map" && (
          <motion.div
            key="map"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <MapView listings={MOCK_LISTINGS} />
          </motion.div>
        )}
        {view === "match" && (
          <motion.div
            key="match"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <MatchView listings={MOCK_LISTINGS} />
          </motion.div>
        )}
        {view === "chat" && (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ChatView />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
