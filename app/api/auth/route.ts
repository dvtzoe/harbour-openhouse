import { STAFF_COOKIE, checkPassword, makeStaffToken } from "@/lib/auth";
import { bad, isHttps, jsonBody, setCookie } from "@/lib/http";

export async function POST(req: Request) {
  const body = await jsonBody<{ password?: string }>(req);
  if (!(await checkPassword(body?.password ?? ""))) return bad("errors.wrongPassword", 401);
  const { value, maxAge } = await makeStaffToken();
  return Response.json({ ok: true }, { headers: { "Set-Cookie": setCookie(STAFF_COOKIE, value, maxAge, isHttps(req)) } });
}

export async function DELETE(req: Request) {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": setCookie(STAFF_COOKIE, "", 0, isHttps(req)) } });
}
