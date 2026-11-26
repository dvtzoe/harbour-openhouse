import { waitUntil } from "cloudflare:workers";
import { getEnv } from "./env";

/** Tell connected clients on these topics to refetch. Never throws. */
export async function broadcast(...topics: string[]) {
  try {
    const live = getEnv().LIVE;
    const hub = live.get(live.idFromName("global"));
    await hub.fetch("https://live/broadcast", {
      method: "POST",
      body: JSON.stringify({ topics }),
    });
  } catch (e) {
    console.error("broadcast failed", e);
  }
}

/** Fire-and-forget broadcast: the response doesn't wait for the hub. */
export function broadcastLater(...topics: string[]) {
  waitUntil(broadcast(...topics));
}
