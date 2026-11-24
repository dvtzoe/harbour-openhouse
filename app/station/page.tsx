import { headers } from "next/headers";
import QRCode from "qrcode";
import { requireStaff } from "@/lib/require-staff";
import StationClient from "./station-client";

export const dynamic = "force-dynamic";

export default async function StationPage() {
  await requireStaff("/station");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const playUrl = `${proto}://${host}/play`;
  const qrSvg = await QRCode.toString(playUrl, {
    type: "svg",
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
  return <StationClient qrSvg={qrSvg} playUrl={playUrl} />;
}
