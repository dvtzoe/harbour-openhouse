import { GUEST_COOKIE, guestToken } from "@/lib/auth";
import { guestByToken, guestView, majors, registerGuest } from "@/lib/guests";
import { bad, isHttps, jsonBody, setCookie } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guestByToken(await guestToken());
  // Not registered yet: send the majors for the sign-up dropdown.
  if (!g) return Response.json({ guest: null, majors: (await majors()).map((m) => ({ id: m.id, name: m.name })) });
  return Response.json({ guest: await guestView(g) });
}

export async function POST(req: Request) {
  const existing = await guestByToken(await guestToken());
  if (existing) return Response.json({ guest: await guestView(existing) });

  const body = await jsonBody<{ name?: string; majorId?: string }>(req);
  const { guest, error } = await registerGuest(body?.name ?? "", body?.majorId ?? "");
  if (!guest) return bad(error ?? "Invalid name");
  return Response.json(
    { guest: await guestView(guest) },
    { headers: { "Set-Cookie": setCookie(GUEST_COOKIE, guest.token, 60 * 60 * 24 * 7, isHttps(req)) } },
  );
}
