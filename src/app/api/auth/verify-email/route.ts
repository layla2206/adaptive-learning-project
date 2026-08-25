import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { signSessionToken } from "@/lib/authJwt";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const { data: record, error } = await supabase
      .from("email_verifications")
      .select("token_id, user_id, expires_at, used")
      .eq("token", token)
      .maybeSingle();

    if (error) {
      console.error("Verification lookup error:", error.message);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    if (!record || record.used || new Date(record.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "This verification link is invalid or has expired. Log in again to get a new one." },
        { status: 400 }
      );
    }

    const { error: markUsedError } = await supabase
      .from("email_verifications")
      .update({ used: true })
      .eq("token_id", record.token_id);

    if (markUsedError) {
      console.error("Verification mark-used error:", markUsedError.message);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .update({ is_verified: true })
      .eq("user_id", record.user_id)
      .select("user_id, role")
      .single();

    if (userError || !userRow) {
      console.error("User verify update error:", userError?.message);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    const sessionToken = signSessionToken({ user_id: userRow.user_id, role: userRow.role });
    return NextResponse.json({ token: sessionToken, role: userRow.role });
  } catch (error) {
    console.error("Verify email error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
