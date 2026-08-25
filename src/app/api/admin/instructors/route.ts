import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { hashPassword } from "@/lib/authPassword";
import { getCurrentUser } from "@/lib/authMiddleware";

export async function POST(req: NextRequest) {
  const currentUser = getCurrentUser(req);
  if (!currentUser || currentUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { name, email, password } = await req.json();
    if (!name || !email || !password) {
      return NextResponse.json({ error: "name, email, and password are required" }, { status: 400 });
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: "An account already exists for this email." }, { status: 409 });
    }

    const { data: instructorRow, error: instructorError } = await supabase
      .from("instructors")
      .insert({ name, email })
      .select("instructor_id")
      .single();

    if (instructorError || !instructorRow) {
      console.error("Instructor insert error:", instructorError?.message);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    const passwordHash = await hashPassword(password);

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .insert({
        email,
        password_hash: passwordHash,
        role: "instructor",
        is_verified: false,
        instructor_id: instructorRow.instructor_id,
      })
      .select("user_id")
      .single();

    if (userError || !userRow) {
      console.error("Instructor user insert error:", userError?.message);
      return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
    }

    return NextResponse.json({ user_id: userRow.user_id, instructor_id: instructorRow.instructor_id });
  } catch (error) {
    console.error("Create instructor error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
