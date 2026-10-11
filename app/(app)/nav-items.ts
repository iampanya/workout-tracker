import { House, ClipboardText, Barbell, ClockCounterClockwise } from "@phosphor-icons/react/ssr";

// labelKey is a key in the `nav` message namespace.
export const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "dashboard", icon: House },
  { href: "/routines", labelKey: "routines", icon: ClipboardText },
  { href: "/exercises", labelKey: "exercises", icon: Barbell },
  { href: "/history", labelKey: "history", icon: ClockCounterClockwise },
] as const;
