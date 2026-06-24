
  import { createEnv } from "@t3-oss/env-core";
  import * as z from "zod";
  const toBool = (v) => v === "true" || v === "1" || v === "yes" || v === "on";
  const server = {
    NODE_ENV: z.enum(["development", "test", "production"]),
    PORT: z.coerce.number().int().min(1).max(65535),
    DATABASE_URL: z.string().min(1).startsWith("postgres://"),
    DEBUG: z.enum(["true", "false", "1", "0", "yes", "no", "on", "off"]).transform(toBool),
    API_KEY: z.string().min(16)
  };
  export function loadEnv(env) { return createEnv({ server, runtimeEnv: env }); }
  export default loadEnv;
