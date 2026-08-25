export interface RosterEntry {
  id: string;
  name: string;
  email: string;
}

// Mock roster the ID-lookup step checks against — stands in for the backend roster table.
export const roster: RosterEntry[] = [
  { id: "21-0001", name: "Youssef Medhat", email: "youssef.medhat@guc.edu.eg" },
  { id: "21-0042", name: "Priya Nandakumar", email: "priya.n@guc.edu.eg" },
  { id: "21-0107", name: "Marcus Webb", email: "marcus.webb@guc.edu.eg" },
];

// Fixed mock OTP — stands in for the code actually emailed by the backend.
export const MOCK_OTP = "123456";

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const visible = user.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(2, user.length - 1))}@${domain}`;
}
