import { redirect } from "next/navigation";
import { isStaff } from "./auth";

export async function requireStaff(path: string) {
  if (!(await isStaff())) redirect(`/login?next=${encodeURIComponent(path)}`);
}
