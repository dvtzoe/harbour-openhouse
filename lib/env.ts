import { env as cfEnv } from "cloudflare:workers";

export interface AppEnv {
  DB: D1Database;
  MEDIA: R2Bucket;
  LIVE: DurableObjectNamespace;
  STAFF_PASSWORD: string;
}

export function getEnv(): AppEnv {
  return cfEnv as unknown as AppEnv;
}
