import { isStaff, unauthorized } from "@/lib/auth";
import { leaderboard } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isStaff())) return unauthorized();
  return Response.json(await leaderboard());
}
