import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabaseClient";
import { verifyPassword } from "@/lib/authPassword";
import { signSessionToken } from "@/lib/authJwt";
import { sendInstructorVerificationEmail } from "@/lib/mailer";

const VERIFICATION_EXPIRY_MS = 30 * 60 * 1000;
const GENERIC_ERROR = "Invalid email or password";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("user_id, password_hash, role, is_verified")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      console.error("Login lookup error:", error.message);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const passwordMatches = await verifyPassword(password, user.password_hash);
    if (!passwordMatches) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    if (user.role === "instructor" && !user.is_verified) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MS).toISOString();

      const { error: insertError } = await supabase.from("email_verifications").insert({
        user_id: user.user_id,
        token,
        expires_at: expiresAt,
        used: false,
      });

      if (insertError) {
        console.error("Verification token insert error:", insertError.message);
        return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
      }

      const origin = req.nextUrl.origin;
      await sendInstructorVerificationEmail(email, `${origin}/verify-email?token=${token}`);

      return NextResponse.json({ status: "verification_required" });
    }

    const sessionToken = signSessionToken({ user_id: user.user_id, role: user.role });
    return NextResponse.json({ token: sessionToken, role: user.role });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
