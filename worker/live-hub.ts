import { DurableObject } from "cloudflare:workers";

/**
 * Single global hub that fans out "something changed" signals over
 * hibernating WebSockets. Messages carry no game data — clients refetch
 * through the normal (authenticated) APIs when they receive a signal.
 *
 * Topics: "leaderboard", "guest:<guestId>".
 */
export class LiveHub extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const { topics } = (await request.json()) as { topics: string[] };
      const payload = JSON.stringify({ type: "changed", topics });
      for (const topic of topics) {
        for (const ws of this.ctx.getWebSockets(topic)) {
          try {
            ws.send(payload);
          } catch {
            // socket already closing; ignore
          }
        }
      }
      return new Response("ok");
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const topic = url.searchParams.get("topic") ?? "";
    if (!/^(leaderboard|guest:[A-Za-z0-9-]{1,64})$/.test(topic)) {
      return new Response("Bad topic", { status: 400 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [topic]);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Keep-alive pings from the client.
    if (message === "ping") ws.send("pong");
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code, "closing");
    } catch {
      // already closed
    }
  }
}
