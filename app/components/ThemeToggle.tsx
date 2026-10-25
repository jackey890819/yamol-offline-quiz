import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "color-scheme";

function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === "light" || val === "dark") return val;
  } catch {
    // ignore storage errors
  }
  return "system";
}

function applyMetaColorScheme(pref: ThemePreference) {
  if (typeof document === "undefined") return;
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="color-scheme"]'
  );
  if (meta) {
    meta.content = pref === "system" ? "light dark" : pref;
  }
}

function subscribeSystemDark(callback: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSystemDarkSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getServerSystemDarkSnapshot(): boolean | null {
  return null;
}

const themeListeners = new Set<() => void>();

function notifyThemeListeners() {
  for (const listener of themeListeners) {
    listener();
  }
}

function subscribeThemePreference(callback: () => void) {
  themeListeners.add(callback);
  if (typeof window === "undefined") {
    return () => {
      themeListeners.delete(callback);
    };
  }
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      applyMetaColorScheme(getStoredPreference());
      callback();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    themeListeners.delete(callback);
    window.removeEventListener("storage", handleStorage);
  };
}

function getServerThemePreferenceSnapshot(): ThemePreference {
  return "system";
}

export function setThemePreference(next: ThemePreference) {
  try {
    if (next === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, next);
    }
  } catch {
    // ignore storage access issues
  }
  applyMetaColorScheme(next);
  notifyThemeListeners();
}

export function ThemeToggle() {
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    getStoredPreference,
    getServerThemePreferenceSnapshot
  );

  const systemIsDark = useSyncExternalStore(
    subscribeSystemDark,
    getSystemDarkSnapshot,
    getServerSystemDarkSnapshot
  );

  const options: {
    id: ThemePreference;
    label: string;
    title: string;
    icon: typeof Sun;
  }[] = [
    {
      id: "light",
      label: "淺色",
      title: "固定為淺色（白色）主題",
      icon: Sun,
    },
    {
      id: "dark",
      label: "深色",
      title: "固定為深色（黑色）主題",
      icon: Moon,
    },
    {
      id: "system",
      label: "系統",
      title:
        systemIsDark !== null
          ? `隨系統動態變更（目前系統為${systemIsDark ? "深色" : "淺色"}）`
          : "隨系統動態變更",
      icon: Monitor,
    },
  ];

  return (
    <div
      role="group"
      aria-label="介面主題切換"
      className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800"
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = preference === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => setThemePreference(opt.id)}
            aria-pressed={isActive}
            title={opt.title}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              isActive
                ? "bg-white text-indigo-700 shadow-2xs dark:bg-slate-900 dark:text-indigo-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{opt.label}</span>
            {opt.id === "system" && systemIsDark !== null && (
              <span className="sr-only">
                （目前系統為{systemIsDark ? "深色" : "淺色"}）
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
