import type { MessageKey, Vars } from "./i18n/core";
import { serverT } from "./i18n/server";

export function setCookie(name: string, value: string, maxAgeSec: number, secure: boolean) {
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export const isHttps = (req: Request) => new URL(req.url).protocol === "https:";

/** Error response in the viewer's language. `code` is the message key, for clients that branch on the error. */
export async function bad(key: MessageKey, status = 400, vars?: Vars) {
  const t = await serverT();
  return Response.json({ error: t(key, vars), code: key }, { status });
}

export async function jsonBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
