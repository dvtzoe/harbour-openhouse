import { cookies } from "next/headers";
import { getEnv } from "./env";
import { bad } from "./http";

export const STAFF_COOKIE = "hs_staff";
export const GUEST_COOKIE = "hs_guest";
const STAFF_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const enc = new TextEncoder();

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode("harbour-staff:" + getEnv().STAFF_PASSWORD),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function checkPassword(pw: string) {
  const expected = getEnv().STAFF_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(await hmac("pw:" + pw), await hmac("pw:" + expected));
}

export async function makeStaffToken() {
  const exp = Date.now() + STAFF_TTL_MS;
  return { value: `${exp}.${await hmac("staff:" + exp)}`, maxAge: STAFF_TTL_MS / 1000 };
}

export async function isStaff(): Promise<boolean> {
  const raw = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!raw || !getEnv().STAFF_PASSWORD) return false;
  const [exp, sig] = raw.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return timingSafeEqual(sig, await hmac("staff:" + exp));
}

export function unauthorized() {
  return bad("errors.staffLogin", 401);
}

export async function guestToken(): Promise<string | undefined> {
  return (await cookies()).get(GUEST_COOKIE)?.value;
}
