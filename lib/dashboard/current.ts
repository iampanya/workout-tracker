import { cache } from "react";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/session";
import { listInProgressSessions, type InProgressSession } from "./service";

// Request-scoped, deduplicated accessor for the in-progress list (layout resume link + dashboard
// page share one query per render). Resolves identity itself. Kept out of service.ts so the
// data-layer module stays free of the auth (next-auth) import — important for unit tests.
export const getInProgressSessions = cache(async (): Promise<InProgressSession[]> => {
  const user = await getAuthUser();
  if (!user) return [];
  return listInProgressSessions(prisma, user.id);
});
