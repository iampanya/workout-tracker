import { House, ClipboardText, Barbell, ClockCounterClockwise } from "@phosphor-icons/react/ssr";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: House },
  { href: "/routines", label: "Routines", icon: ClipboardText },
  { href: "/exercises", label: "Exercises", icon: Barbell },
  { href: "/history", label: "History", icon: ClockCounterClockwise },
] as const;
