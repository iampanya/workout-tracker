"use client";

import { Desktop, Moon, Sun } from "@phosphor-icons/react/ssr";
import { IconButton } from "@/components/ui/IconButton";
import { useTheme, type ThemeMode } from "./ThemeProvider";

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const MODE_ICON: Record<ThemeMode, React.ReactNode> = {
  system: <Desktop className="h-5 w-5" />,
  light: <Sun className="h-5 w-5" />,
  dark: <Moon className="h-5 w-5" />,
};

const MODE_LABEL: Record<ThemeMode, string> = {
  system: "system",
  light: "light",
  dark: "dark",
};

export function ThemeToggleButton() {
  const { mode, setMode } = useTheme();

  return (
    <IconButton
      icon={MODE_ICON[mode]}
      aria-label={`Theme: ${MODE_LABEL[mode]} — switch to ${MODE_LABEL[NEXT_MODE[mode]]}`}
      onClick={() => setMode(NEXT_MODE[mode])}
    />
  );
}
