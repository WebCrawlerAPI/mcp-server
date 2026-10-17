import { createApp } from "./app.js";
import { IntrospectionVerifier } from "./auth.js";
import { loadConfig } from "./config.js";
import { log } from "./log.js";

let cfg: ReturnType<typeof loadConfig>;
try {
  cfg = loadConfig();
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : "invalid configuration"}\n`);
  process.exit(1);
}

const app = createApp(cfg, new IntrospectionVerifier(cfg));
const server = app.listen(cfg.port, () => {
  log("info", "listening", { port: cfg.port, resource: cfg.resourceUri });
});

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
