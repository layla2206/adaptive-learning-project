import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set in .env — auth routes cannot sign or verify tokens without it."
  );
}

export type SessionPayload = {
  user_id: string;
  role: "student" | "instructor" | "admin";
};

export type SetPasswordPayload = {
  student_id: string;
  purpose: "set_password";
};

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "7d" });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as SessionPayload;
  } catch {
    return null;
  }
}

export function signSetPasswordToken(studentId: string): string {
  const payload: SetPasswordPayload = { student_id: studentId, purpose: "set_password" };
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "10m" });
}

export function verifySetPasswordToken(token: string): SetPasswordPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as SetPasswordPayload;
    if (decoded.purpose !== "set_password") return null;
    return decoded;
  } catch {
    return null;
  }
}
