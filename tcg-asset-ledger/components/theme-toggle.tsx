"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

const THEMES = ["light", "dark", "rocket"] as const;
type Theme = (typeof THEMES)[number];

const META: Record<Theme, { icon: React.ElementType; label: string }> = {
  light: { icon: Sun, label: "Light" },
  dark: { icon: Moon, label: "Dark" },
  rocket: { icon: Rocket, label: "Team Rocket" },
};

export function applyTheme(t: Theme) {
  const el = document.documentElement;
  el.classList.remove("dark", "rocket");
  if (t !== "light") el.classList.add(t);
  el.style.colorScheme = t === "light" ? "light" : "dark";
  localStorage.setItem("theme", t);
  // Keep every toggle instance (sidebar + mobile header) in sync.
  window.dispatchEvent(new CustomEvent("themechange", { detail: t }));
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  // Render a stable placeholder until mounted (theme lives in localStorage).
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    setTheme(THEMES.includes(stored as Theme) ? (stored as Theme) : "light");
    const onChange = (e: Event) => setTheme((e as CustomEvent).detail as Theme);
    window.addEventListener("themechange", onChange);
    return () => window.removeEventListener("themechange", onChange);
  }, []);

  function cycle() {
    if (!theme) return;
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    applyTheme(next);
    setTheme(next);
  }

  const t = theme ?? "light";
  const Icon = META[t].icon;

  return (
    <button
      type="button"
      onClick={cycle}
      title={`Theme: ${META[t].label} — click to switch`}
      className={cn(
        "flex items-center gap-3 rounded-md text-sm font-medium transition-colors",
        "text-foreground/70 hover:bg-accent hover:text-accent-foreground",
        compact ? "p-2" : "w-full px-3 py-2",
      )}
    >
      <Icon className={cn("size-4", t === "rocket" && "text-primary")} />
      {compact ? null : (
        <span className="flex-1 text-left">
          {META[t].label}
          {t === "rocket" ? <span className="ml-1 text-primary">R</span> : null}
        </span>
      )}
    </button>
  );
}
