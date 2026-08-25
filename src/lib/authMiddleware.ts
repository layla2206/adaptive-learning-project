import { NextRequest } from "next/server";
import { verifySessionToken, SessionPayload } from "@/lib/authJwt";

export function getCurrentUser(req: NextRequest): SessionPayload | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifySessionToken(header.slice("Bearer ".length));
}
