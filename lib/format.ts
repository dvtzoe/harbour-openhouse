export function fmtDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalTenths = Math.floor(ms / 100);
  const t = totalTenths % 10;
  const s = Math.floor(totalTenths / 10) % 60;
  const m = Math.floor(totalTenths / 600) % 60;
  const h = Math.floor(totalTenths / 36000);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}.${t}` : `${mm}:${ss}.${t}`;
}
