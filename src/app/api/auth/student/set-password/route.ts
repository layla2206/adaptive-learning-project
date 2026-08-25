import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { verifySetPasswordToken, signSessionToken } from "@/lib/authJwt";
import { hashPassword } from "@/lib/authPassword";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: NextRequest) {
  try {
    const { token, password, confirm_password } = await req.json();
    if (!token || !password || !confirm_password) {
      return NextResponse.json(
        { error: "token, password, and confirm_password are required" },
        { status: 400 }
      );
    }

    const decoded = verifySetPasswordToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "This link has expired. Start sign-up again." }, { status: 401 });
    }

    if (password !== confirm_password) {
      return NextResponse.json({ error: "Passwords don't match." }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const { student_id } = decoded;

    const { data: rosterRows, error: rosterError } = await supabase
      .from("roster")
      .select("name, email, course_id")
      .eq("student_id", student_id);

    if (rosterError || !rosterRows || rosterRows.length === 0) {
      console.error("Roster fetch error on set-password:", rosterError?.message);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    const { name, email } = rosterRows[0];
    const courseIds = [...new Set(rosterRows.map((r) => r.course_id))];

    const { data: existingUser } = await supabase
      .from("users")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: "An account already exists for this student." }, { status: 409 });
    }

    let { data: studentRow } = await supabase
      .from("students")
      .select("student_id")
      .eq("email", email)
      .maybeSingle();

    if (!studentRow) {
      const { data: newStudent, error: studentInsertError } = await supabase
        .from("students")
        .insert({ name, email })
        .select("student_id")
        .single();

      if (studentInsertError || !newStudent) {
        console.error("Student row insert error:", studentInsertError?.message);
        return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
      }
      studentRow = newStudent;
    }

    const passwordHash = await hashPassword(password);

    const { data: newUser, error: userInsertError } = await supabase
      .from("users")
      .insert({
        email,
        password_hash: passwordHash,
        role: "student",
        is_verified: true,
        student_id: studentRow.student_id,
      })
      .select("user_id")
      .single();

    if (userInsertError || !newUser) {
      console.error("User insert error:", userInsertError?.message);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    const enrollmentIdBase = Date.now().toString(36);
    const enrollmentRows = courseIds.map((courseId, i) => ({
      enrollment_id: `${enrollmentIdBase}${i}`.slice(0, 10),
      student_id: studentRow!.student_id,
      course_id: courseId,
    }));

    const { error: enrollError } = await supabase
      .from("enrollments")
      .upsert(enrollmentRows, { onConflict: "student_id,course_id", ignoreDuplicates: true });

    if (enrollError) {
      console.error("Enrollment insert error (non-fatal):", enrollError.message);
    }

    const sessionToken = signSessionToken({ user_id: newUser.user_id, role: "student" });
    return NextResponse.json({ token: sessionToken, role: "student" });
  } catch (error) {
    console.error("Set password error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
