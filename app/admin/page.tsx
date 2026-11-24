import { requireStaff } from "@/lib/require-staff";
import AdminClient from "./admin-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireStaff("/admin");
  return <AdminClient />;
}
