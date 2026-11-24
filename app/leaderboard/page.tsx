import { requireStaff } from "@/lib/require-staff";
import LeaderboardClient from "./leaderboard-client";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  await requireStaff("/leaderboard");
  return <LeaderboardClient />;
}
