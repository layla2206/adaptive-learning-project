import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { signSetPasswordToken } from "@/lib/authJwt";

export async function POST(req: NextRequest) {
  try {
    const { student_id, code } = await req.json();
    if (!student_id || !code) {
      return NextResponse.json({ error: "student_id and code are required" }, { status: 400 });
    }

    const { data: otpRows, error } = await supabase
      .from("otp_tokens")
      .select("otp_id, code, expires_at, used")
      .eq("student_id", student_id)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("OTP fetch error:", error.message);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    const otp = otpRows?.[0];
    if (!otp || otp.code !== code) {
      return NextResponse.json({ error: "That code is incorrect or has expired." }, { status: 400 });
    }

    if (new Date(otp.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "That code is incorrect or has expired." }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("otp_tokens")
      .update({ used: true })
      .eq("otp_id", otp.otp_id);

    if (updateError) {
      console.error("OTP mark-used error:", updateError.message);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    const token = signSetPasswordToken(student_id);
    return NextResponse.json({ token });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
