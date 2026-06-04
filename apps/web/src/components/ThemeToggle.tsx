import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === "dark" ? "Mode clair" : "Mode sombre"}
      aria-label={theme === "dark" ? "Activer le mode clair" : "Activer le mode sombre"}
      className="p-2 rounded-full hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
