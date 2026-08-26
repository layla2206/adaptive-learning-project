import { NextRequest } from "next/server";
import { verifySessionToken, SessionPayload } from "@/lib/authJwt";
import { supabase } from "@/lib/supabaseClient";

export function getCurrentUser(req: NextRequest): SessionPayload | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifySessionToken(header.slice("Bearer ".length));
}

/** Resolves the student_id linked to a user_id, or null if there isn't one. */
export async function getStudentId(userId: string): Promise<string | null> {
  const { data } = await supabase.from("users").select("student_id").eq("user_id", userId).maybeSingle();
  return data?.student_id ?? null;
}
