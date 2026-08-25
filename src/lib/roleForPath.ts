export type Role = "student" | "instructor" | "admin";

export function roleForPath(pathname: string): Role {
  if (pathname.startsWith("/instructor")) return "instructor";
  if (pathname.startsWith("/admin")) return "admin";
  return "student";
}

export function homeForRole(role: Role): string {
  if (role === "instructor") return "/instructor";
  if (role === "admin") return "/admin";
  return "/dashboard";
}
