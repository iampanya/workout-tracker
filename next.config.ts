import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Picks up ./i18n/request.ts (cookie-based locale, see i18n/config.ts).
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
};

export default withNextIntl(nextConfig);
