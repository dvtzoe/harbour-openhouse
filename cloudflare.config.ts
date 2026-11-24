import { bindings, defineConfig, defineWorker, exports } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "harbour-openhouse",
    // Custom entry: wraps vinext's fetch handler, adds the /ws live socket
    // route and exports the LiveHub Durable Object.
    entrypoint: "./worker/index.ts",
    compatibilityDate: "2026-11-24",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      DB: bindings.d1({ name: "harbour-openhouse-db" }),
      MEDIA: bindings.r2({ name: "harbour-openhouse-media" }),
      LIVE: bindings.durableObject({ worker: "harbour-openhouse", exportName: "LiveHub" }),
      STAFF_PASSWORD: bindings.secret(),
    },
    exports: {
      // SQLite-backed: the only Durable Object storage available on Workers Free.
      LiveHub: exports.durableObject({ storage: "sqlite" }),
    },
  }),
});
