import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabaseClient";
import { sendOtpEmail } from "@/lib/mailer";
import { isRateLimited } from "@/lib/rateLimit";

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${"*".repeat(Math.max(user.length - visible.length, 1))}@${domain}`;
}

export async function POST(req: NextRequest) {
  try {
    const { student_id } = await req.json();
    if (!student_id || typeof student_id !== "string") {
      return NextResponse.json({ error: "student_id is required" }, { status: 400 });
    }

    if (isRateLimited(`lookup:${student_id}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in a few minutes." },
        { status: 429 }
      );
    }

    const { data: rosterRows, error } = await supabase
      .from("roster")
      .select("student_id, name, email")
      .eq("student_id", student_id)
      .limit(1);

    if (error) {
      console.error("Roster lookup error:", error.message);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    if (!rosterRows || rosterRows.length === 0) {
      return NextResponse.json(
        { error: "We couldn't find that student ID. Check with your instructor if this looks wrong." },
        { status: 404 }
      );
    }

    const { email } = rosterRows[0];
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();

    const { error: insertError } = await supabase.from("otp_tokens").insert({
      student_id,
      email,
      code,
      expires_at: expiresAt,
      used: false,
    });

    if (insertError) {
      console.error("OTP insert error:", insertError.message);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    await sendOtpEmail(email, code);

    return NextResponse.json({ maskedEmail: maskEmail(email) });
  } catch (error) {
    console.error("Student lookup error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
