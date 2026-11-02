import { House, ClipboardText, Barbell, ClockCounterClockwise, PersonSimple, ChartLineUp } from "@phosphor-icons/react/ssr";

// labelKey is a key in the `nav` message namespace.
export const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "dashboard", icon: House },
  { href: "/routines", labelKey: "routines", icon: ClipboardText },
  { href: "/exercises", labelKey: "exercises", icon: Barbell },
  { href: "/history", labelKey: "history", icon: ClockCounterClockwise },
] as const;

// The phone's bottom bar is full (two links, the log FAB, two links), so Insights and Body are
// only in the desktop top bar; phones reach them from the dashboard cards and the account menu.
export const TOP_NAV_ITEMS = [
  ...NAV_ITEMS,
  { href: "/insights", labelKey: "insights", icon: ChartLineUp },
  { href: "/body", labelKey: "body", icon: PersonSimple },
] as const;
