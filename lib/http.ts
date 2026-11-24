export function setCookie(name: string, value: string, maxAgeSec: number, secure: boolean) {
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export const isHttps = (req: Request) => new URL(req.url).protocol === "https:";

export function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}

export async function jsonBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
