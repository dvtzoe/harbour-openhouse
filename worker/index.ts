import vinext from "vinext/server/fetch-handler";
import { LiveHub } from "./live-hub";

export { LiveHub };

type Env = { LIVE: DurableObjectNamespace };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    // Live-update sockets bypass the React pipeline and go straight to the hub.
    if (url.pathname === "/ws") {
      const hub = env.LIVE.get(env.LIVE.idFromName("global"));
      return hub.fetch(request);
    }
    return (vinext as ExportedHandler<Env>).fetch!(request as never, env, ctx);
  },
} satisfies ExportedHandler<Env>;
